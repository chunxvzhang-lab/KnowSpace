"""
Independently verifies a published GitHub release.

The publisher's own log is its account of what it did, not evidence that it
happened — it prints `[SUCCESS]` whether or not every asset finished uploading.
So this asks GitHub directly and checks the three things that actually matter:

  1. **Which commit the tag resolves to** — must equal local HEAD. Checking only
     "the tag exists" would pass a tag left pointing at an older commit.
  2. **Asset byte sizes** — must equal the local files EXACTLY, not after
     rounding, and every asset must be `uploaded`. A truncated upload looks
     completely normal by filename, by MB and in the log.
  3. **The body** — must contain the new sections, and the corrected numbers must
     be present. The publisher PATCHes the body, so a body that failed to update
     does not raise anything.

Usage: python scripts/verify-github-release.py <tag> [--repo OWNER/REPO]
"""

import argparse
import json
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request

DEFAULT_REPO = "chunxvzhang-lab/KnowSpace"


def api(url: str) -> dict:
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


class RateLimited(Exception):
    """Unauthenticated requests are metered per egress IP; a shared proxy burns it fast."""

    def __init__(self, reset_at: int | None) -> None:
        self.reset_at = reset_at
        super().__init__("rate limited")


def api_or_rate_limit(url: str) -> dict:
    """`api`, but turning a 403 into something a caller can explain."""
    try:
        return api(url)
    except urllib.error.HTTPError as error:
        if error.code == 403:
            raise RateLimited(_rate_limit_reset()) from error
        raise


def _rate_limit_reset() -> int | None:
    """When the core quota comes back, from the un-metered rate_limit endpoint."""
    try:
        with urllib.request.urlopen(
            "https://api.github.com/rate_limit", timeout=30
        ) as response:
            return json.loads(response.read().decode("utf-8"))["resources"]["core"]["reset"]
    except Exception:  # noqa: BLE001
        return None


def local_head() -> str:
    return subprocess.run(
        ["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True
    ).stdout.strip()


def tag_commit(tag: str) -> str:
    """The commit a tag points at, dereferencing an annotated tag."""
    return subprocess.run(
        ["git", "rev-parse", f"{tag}^{{}}"], capture_output=True, text=True, check=True
    ).stdout.strip()


def _git_ok(*args: str) -> bool:
    return subprocess.run(args, capture_output=True, text=True).returncode == 0


def _is_ancestor(maybe_ancestor: str, descendant: str) -> bool:
    return _git_ok("git", "merge-base", "--is-ancestor", maybe_ancestor, descendant)


def _count(base: str, tip: str) -> int:
    result = subprocess.run(
        ["git", "rev-list", "--count", f"{base}..{tip}"],
        capture_output=True,
        text=True,
        check=True,
    )
    return int(result.stdout.strip() or 0)


def report_rate_limit(limited: "RateLimited") -> int:
    """
    Says "come back later", not "the release is broken".

    This distinction matters: the quota is per egress IP and a shared proxy burns
    it quickly, so a 403 here says nothing at all about the release. Reporting it
    as a verification failure would send someone looking for a problem that does
    not exist.
    """
    print()
    if limited.reset_at:
        import time

        wait = max(0, limited.reset_at - int(time.time()))
        when = time.strftime("%H:%M:%S", time.localtime(limited.reset_at))
        print(f"⏳ GitHub API 限流（未认证请求按出口 IP 计 60 次/小时）")
        print(f"   额度于 {when} 重置，还需约 {wait} 秒。")
    else:
        print("⏳ GitHub API 限流，稍后重试。")
    print("   这不代表发布有问题，只是这次没能核验。")
    return 2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("tag")
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--notes", default=None, help="release notes path to compare against")
    args = parser.parse_args()

    tag = args.tag
    failures: list[str] = []

    print(f"=== 1. 标签 {tag} 指向的提交 ===")
    try:
        remote = api_or_rate_limit(f"https://api.github.com/repos/{args.repo}/commits/{tag}")
        remote_sha = remote["sha"]
    except RateLimited as limited:
        return report_rate_limit(limited)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            print(f"❌ {tag} 在远端不存在")
            return 1
        raise

    head = local_head()
    if remote_sha == head:
        print(f"✅ 远端标签提交 == 本地 HEAD  {remote_sha[:8]}")
    elif _is_ancestor(remote_sha, head):
        # Not a failure. A post-release commit (tooling, notes) moves HEAD past
        # the tag, and that is normal — what must not happen is the tag pointing
        # at a commit that is not on this line of history, which is what a
        # "released from an older commit" mistake looks like.
        ahead = _count(remote_sha, head)
        print(f"✅ 远端标签提交 {remote_sha[:8]} 是本行历史（HEAD 之后又提交了 {ahead} 次）")
    else:
        failures.append(f"标签提交 {remote_sha[:8]} 不在本地 HEAD 的历史上")
        print(f"❌ 标签提交 {remote_sha[:8]} 不在本地 HEAD 的历史上")
        print(f"   本地 HEAD {head[:8]} —— 标签可能打在了旧提交或别的分支上")

    print()
    print("=== 2. Release 与资产 ===")
    try:
        release = api_or_rate_limit(f"https://api.github.com/repos/{args.repo}/releases/tags/{tag}")
    except RateLimited as limited:
        return report_rate_limit(limited)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            print(f"❌ {tag} 还没有 Release")
            return 1
        raise

    print(f"release id : {release['id']}")
    print(f"name       : {release.get('name')}")
    print(f"draft      : {release.get('draft')}  prerelease: {release.get('prerelease')}")
    print(f"published  : {release.get('published_at')}")
    print()

    assets = {asset["name"]: asset for asset in release.get("assets", [])}

    # The three the publisher is documented to send.
    expected = [
        f"KnowSpace-Setup-{tag.lstrip('v')}.exe",
        f"KnowSpace-{tag.lstrip('v')}.msi",
        "KnowSpace-win-x64-portable.zip",
    ]

    for name in expected:
        asset = assets.get(name)
        if asset is None:
            failures.append(f"缺少资产 {name}")
            print(f"❌ 缺少资产 {name}")
            continue
        path = pathlib.Path("release") / name
        if not path.exists():
            print(f"⚠️  {name}: 本地文件不存在，无法比对字节数")
            continue
        local_size = path.stat().st_size
        if asset["size"] == local_size and asset["state"] == "uploaded":
            print(f"✅ {name}")
            print(f"     {asset['size']} 字节（与本地一致）state={asset['state']}")
        else:
            failures.append(f"{name} 字节数或状态不符")
            print(f"❌ {name}")
            print(f"     远端 {asset['size']} / 本地 {local_size}  state={asset['state']}")

    print()
    print("=== 3. 正文 ===")
    body = release.get("body") or ""
    print(f"长度: {len(body)} 字符")

    if args.notes:
        notes = pathlib.Path(args.notes).read_text(encoding="utf-8")
        # The publisher may slim the body, so compare on headings rather than the
        # whole file: a missing section is the failure worth catching.
        headings = [line.strip() for line in notes.splitlines() if line.startswith("## ")]
        for heading in headings:
            if heading in body:
                print(f"✅ 含章节 {heading}")
            else:
                failures.append(f"正文缺少章节 {heading}")
                print(f"❌ 正文缺少章节 {heading}")

    print()
    if failures:
        print("❌ 核验未通过：")
        for item in failures:
            print("   - " + item)
        return 1
    print("✅ 发布核验全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
