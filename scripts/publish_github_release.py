"""
发布一个 GitHub Release：建标签、建（或更新）Release、上传三个安装资产。

版本号不再写死在这里 —— 它从 `package.json` 读，其余一切由它推出：

    tag        v<version>
    Release 正文  docs/RELEASE_NOTES_v<version>.md
    资产        release/KnowSpace-Setup-<version>.exe、KnowSpace-<version>.msi、
               release/KnowSpace-win-x64-portable.zip

上一版这个脚本把 "v2.5.0" 写在七个地方（标签、标题、notes 路径、三个资产路径），
于是"发一个新版本"意味着先精确地改七处 —— 漏一处就会把**新版本的资产传到旧版本的
Release 上**，而那看起来像成功了。

用法：
    npm run desktop:pack          # 先产出 release/ 下的三个资产
    python scripts/publish_github_release.py --title "KnowSpace v2.6.0 - ..."

凭据取自 `git credential fill`（与推送用的是同一份），所以不需要单独配 token。
所在网络需要代理时：`HTTPS_PROXY` 给 urllib 与 curl.exe，`KNOWSPACE_GIT_PROXY` 给 git
（git 不认前者）。

标签只在**不存在**时创建；已存在就沿用，除非显式传 `--force-tag`。强制移动一个已经
发布过的标签会让别人手里的副本指向另一段历史，那不是发版该顺手做的事。
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OWNER = "chunxvzhang-lab"
REPO = "KnowSpace"


def read_version() -> str:
    data = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    return str(data["version"])


def find_git() -> str:
    """
    `git`，先看 PATH，再看几个它的常见落点。

    这台机器上 `git` 并不在 PATH 里 —— 平时提交与推送走的是 GitHub Desktop 自带的那一份
    （`...\\GitHubDesktop\\...\\git.exe`）。脚本原来只试 PATH，于是在这里取不到凭据，
    报"系统找不到指定的文件"，而那看起来像网络或权限问题，不像"没找到 git"。
    """
    found = shutil.which("git")
    if found:
        return found

    candidates = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "GitHubDesktop",
        Path("C:/Program Files/Git/cmd"),
        Path("C:/Program Files (x86)/Git/cmd"),
    ]
    for base in candidates:
        if not base.exists():
            continue
        if base.name == "GitHubDesktop":
            for git_exe in sorted(base.glob("app-*/resources/app/git/cmd/git.exe"), reverse=True):
                return str(git_exe)
        else:
            git_exe = base / "git.exe"
            if git_exe.exists():
                return str(git_exe)

    return "git"


def git(*args: str) -> subprocess.CompletedProcess:
    """
    跑一条 git 命令。

    需要代理的网络里，设 `KNOWSPACE_GIT_PROXY=http://host:port` —— git 不认
    `HTTPS_PROXY` 环境变量，只认 `http.proxy` 配置，而把这个地址写进仓库脚本是不对的：
    它是某台机器的网络状况，不是这个项目的一部分。
    """
    command = [find_git()]
    proxy = os.environ.get("KNOWSPACE_GIT_PROXY")
    if proxy:
        command += ["-c", f"http.proxy={proxy}", "-c", f"https.proxy={proxy}"]
    command += list(args)
    return subprocess.run(command, cwd=ROOT, capture_output=True, text=True)


def get_git_token() -> str:
    try:
        proc = subprocess.Popen(
            [find_git(), "credential", "fill"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        out, _ = proc.communicate(input="protocol=https\nhost=github.com\n\n")
        for line in out.splitlines():
            if line.startswith("password="):
                return line.split("=", 1)[1]
    except Exception as error:  # noqa: BLE001 - reported, not raised
        print("Error getting token:", error)
    return ""


def ensure_tag(tag: str, force: bool) -> None:
    exists = git("rev-parse", "-q", "--verify", f"refs/tags/{tag}").returncode == 0

    if exists and not force:
        print(f"1. Tag {tag} already exists; leaving it where it is.")
    else:
        git("tag", "-a", tag, "-m", f"Release {tag}", *( ["-f"] if exists else [] ))
        print(f"1. Tag {tag} {'moved' if exists else 'created'}.")

    git("push", "origin", tag)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", help="默认取 package.json")
    parser.add_argument("--title", help="Release 标题，默认 KnowSpace v<版本>")
    parser.add_argument(
        "--force-tag",
        action="store_true",
        help="已存在同名标签时移动它（默认不移动）",
    )
    args = parser.parse_args()

    version = args.version or read_version()
    tag = f"v{version}"
    title = args.title or f"KnowSpace {tag}"

    notes_path = ROOT / "docs" / f"RELEASE_NOTES_{tag}.md"
    if not notes_path.exists():
        print(f"找不到发行说明：{notes_path}")
        return 1
    body_md = notes_path.read_text(encoding="utf-8")

    assets = [
        (ROOT / "release" / f"KnowSpace-Setup-{version}.exe", f"KnowSpace-Setup-{version}.exe", "application/x-msdownload"),
        (ROOT / "release" / f"KnowSpace-{version}.msi", f"KnowSpace-{version}.msi", "application/x-msi"),
        (ROOT / "release" / "KnowSpace-win-x64-portable.zip", "KnowSpace-win-x64-portable.zip", "application/zip"),
    ]

    token = get_git_token()
    if not token:
        print("未能从 git 凭据中取到 GitHub token。")
        return 1

    ensure_tag(tag, args.force_tag)

    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "KnowSpace-Release-Script",
    }

    rel_data = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f"https://api.github.com/repos/{OWNER}/{REPO}/releases/tags/{tag}", headers=headers
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                rel_data = json.loads(resp.read().decode("utf-8"))
                print(f"Existing release found: {rel_data.get('html_url')}")
                break
        except urllib.error.HTTPError as error:
            if error.code == 404:
                print(f"No existing release for {tag}; will create one.")
                break
            print(f"Notice HTTP {error.code}: {error}")
        except Exception as error:  # noqa: BLE001
            print(f"Attempt {attempt + 1} query notice: {error}")
            time.sleep(2)

    if not rel_data:
        print("2. Creating new GitHub Release via API...")
        req = urllib.request.Request(
            f"https://api.github.com/repos/{OWNER}/{REPO}/releases",
            data=json.dumps(
                {"tag_name": tag, "name": title, "body": body_md, "draft": False, "prerelease": False}
            ).encode("utf-8"),
            headers={**headers, "Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            rel_data = json.loads(resp.read().decode("utf-8"))
    else:
        print("2. Updating existing GitHub Release title and body...")
        req = urllib.request.Request(
            f"https://api.github.com/repos/{OWNER}/{REPO}/releases/{rel_data['id']}",
            data=json.dumps({"name": title, "body": body_md}).encode("utf-8"),
            headers={**headers, "Content-Type": "application/json; charset=utf-8"},
            method="PATCH",
        )
        with urllib.request.urlopen(req) as resp:
            rel_data = json.loads(resp.read().decode("utf-8"))

    upload_base_url = rel_data["upload_url"].split("{")[0]
    html_url = rel_data["html_url"]
    existing_assets = {a["name"]: a["id"] for a in rel_data.get("assets", [])}
    existing_asset_sizes = {a["name"]: a.get("size", 0) for a in rel_data.get("assets", [])}

    for file_path, name, content_type in assets:
        if not file_path.exists():
            print(f"Warning: file not found {file_path} — run `npm run desktop:pack` first.")
            continue

        local_size = file_path.stat().st_size
        size_mb = local_size / (1024 * 1024)

        if name in existing_assets and existing_asset_sizes.get(name) == local_size:
            print(f"Asset {name} already uploaded with the same size ({size_mb:.2f} MB). Skipping.")
            continue

        if name in existing_assets:
            print(f"Asset {name} differs in size ({existing_asset_sizes.get(name)} vs {local_size}); replacing...")
            req = urllib.request.Request(
                f"https://api.github.com/repos/{OWNER}/{REPO}/releases/assets/{existing_assets[name]}",
                headers=headers,
                method="DELETE",
            )
            try:
                with urllib.request.urlopen(req) as resp:
                    print(f"Deleted old asset {name} (HTTP {resp.status}).")
            except Exception as error:  # noqa: BLE001
                print(f"Notice deleting asset: {error}")

        print(f"Uploading asset: {name} ({size_mb:.2f} MB) using curl...")
        upload_url = f"{upload_base_url}?name={urllib.parse.quote(name)}"
        curl_cmd = [
            "curl.exe",
            "-s", "-S",
            "--retry", "3",
            "--retry-delay", "5",
            "-X", "POST",
            "-H", f"Authorization: token {token}",
            "-H", f"Content-Type: {content_type}",
            "--data-binary", f"@{file_path}",
            upload_url,
        ]

        uploaded = False
        for attempt in range(1, 4):
            proc = subprocess.run(curl_cmd, capture_output=True, text=True)
            if proc.returncode == 0:
                print(f"Uploaded {name}.")
                uploaded = True
                break
            print(f"Attempt {attempt} curl failed for {name}: {proc.stderr}")
            if attempt < 3:
                time.sleep(5)

        if not uploaded:
            print(f"Failed to upload {name} after 3 attempts.")
            return 1

    print(f"\n[SUCCESS] Release {tag} published.")
    print(f"View Release: {html_url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
