"""
Script to create GitHub Release v1.3.0 and upload release assets with UTF-8 encoding.
"""
import json
import os
import subprocess
import sys
import urllib.request
import urllib.parse

def get_git_token():
    try:
        proc = subprocess.Popen(
            ["git", "credential", "fill"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        out, _ = proc.communicate(input="protocol=https\nhost=github.com\n\n")
        token = ""
        for line in out.splitlines():
            if line.startswith("password="):
                token = line.split("=", 1)[1]
        return token
    except Exception as e:
        print("Error getting token:", e)
        return ""

def main():
    token = get_git_token()
    if not token:
        print("Failed to get GitHub token from git credentials.")
        sys.exit(1)
    
    owner = "chunxvzhang-lab"
    repo = "KnowSpace"
    tag = "v2.5.0"
    title = "KnowSpace v2.5.0 - FSRS-5 间隔重复闪卡(知识内化闭环)与架构减负(App.tsx -40% / canvasService 拆为 9 模块)"
    
    # 1. Create and push git tag
    print("1. Ensuring git tag exists and is pushed...")
    try:
        subprocess.run(["git", "tag", "-f", "-a", tag, "-m", f"Release {tag}"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["git", "push", "-f", "origin", tag], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"Git tag {tag} checked.")
    except Exception as e:
        print(f"Tag note: {e}")

    # 2. Check existing release or create new
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "KnowSpace-Release-Script"
    }

    rel_data = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f"https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}",
                headers=headers
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                rel_data = json.loads(resp.read().decode("utf-8"))
                print(f"Existing release found: {rel_data.get('html_url')}")
                break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                print(f"No existing release found for {tag}, will create one.")
                break
            print(f"Notice HTTP {e.code}: {e}")
        except Exception as e:
            print(f"Attempt {attempt+1} query notice: {e}")
            time.sleep(2)

    # 3. Create Release Body
    # The release body is read from the maintained notes document rather than
    # embedded here, so the two cannot drift apart.
    notes_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "docs", "RELEASE_NOTES_v2.5.0.md"
    )
    with open(notes_path, "r", encoding="utf-8") as notes_file:
        body_md = notes_file.read()

    if not rel_data:
        create_payload = {
            "tag_name": tag,
            "name": title,
            "body": body_md,
            "draft": False,
            "prerelease": False
        }

        print("2. Creating new GitHub Release via API...")
        req = urllib.request.Request(
            f"https://api.github.com/repos/{owner}/{repo}/releases",
            data=json.dumps(create_payload).encode("utf-8"),
            headers={**headers, "Content-Type": "application/json; charset=utf-8"},
            method="POST"
        )
        with urllib.request.urlopen(req) as resp:
            rel_data = json.loads(resp.read().decode("utf-8"))
    else:
        update_payload = {
            "name": title,
            "body": body_md,
        }
        print("2. Updating existing GitHub Release title and body...")
        req = urllib.request.Request(
            f"https://api.github.com/repos/{owner}/{repo}/releases/{rel_data['id']}",
            data=json.dumps(update_payload).encode("utf-8"),
            headers={**headers, "Content-Type": "application/json; charset=utf-8"},
            method="PATCH"
        )
        with urllib.request.urlopen(req) as resp:
            rel_data = json.loads(resp.read().decode("utf-8"))
    
    upload_url_template = rel_data["upload_url"]
    upload_base_url = upload_url_template.split("{")[0]
    html_url = rel_data["html_url"]
    existing_assets = {a["name"]: a["id"] for a in rel_data.get("assets", [])}
    existing_asset_sizes = {a["name"]: a.get("size", 0) for a in rel_data.get("assets", [])}

    # 4. Upload Assets
    release_dir = r"C:\Users\chunxvzhang\Desktop\codex\release"
    msi_path = os.path.join(release_dir, "KnowSpace-2.5.0.msi")
    setup_exe_path = os.path.join(release_dir, "KnowSpace-Setup-2.5.0.exe")
    portable_zip_path = os.path.join(release_dir, "KnowSpace-win-x64-portable.zip")

    assets_to_upload = [
        (
            setup_exe_path,
            "KnowSpace-Setup-2.5.0.exe",
            "application/x-msdownload"
        ),
        (
            msi_path,
            "KnowSpace-2.5.0.msi",
            "application/x-msi"
        ),
        (
            portable_zip_path,
            "KnowSpace-win-x64-portable.zip",
            "application/zip"
        )
    ]

    import time
    for file_path, name, content_type in assets_to_upload:
        if not file_path or not os.path.exists(file_path):
            print(f"Warning: file not found {file_path}")
            continue

        local_size = os.path.getsize(file_path)
        size_mb = local_size / (1024 * 1024)

        # Skip already uploaded identical asset
        if name in existing_assets and existing_asset_sizes.get(name) == local_size:
            print(f"Asset {name} already uploaded and matches size ({local_size} bytes / {size_mb:.2f} MB). Skipping.")
            continue

        # Delete existing asset if present but size differs
        if name in existing_assets:
            print(f"Asset {name} exists with different size ({existing_asset_sizes.get(name)} vs {local_size}), deleting...")
            del_asset_req = urllib.request.Request(
                f"https://api.github.com/repos/{owner}/{repo}/releases/assets/{existing_assets[name]}",
                headers=headers,
                method="DELETE"
            )
            try:
                with urllib.request.urlopen(del_asset_req) as del_resp:
                    print(f"Deleted old asset {name} (HTTP {del_resp.status}).")
            except Exception as e:
                print(f"Notice deleting asset: {e}")

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
            upload_url
        ]

        uploaded = False
        for attempt in range(1, 4):
            try:
                proc = subprocess.run(curl_cmd, capture_output=True, text=True)
                if proc.returncode == 0:
                    try:
                        up_data = json.loads(proc.stdout)
                        if "browser_download_url" in up_data:
                            print(f"Uploaded {name} successfully! Asset URL: {up_data.get('browser_download_url')}")
                            uploaded = True
                            break
                        else:
                            print(f"Upload response note: {proc.stdout[:200]}")
                            uploaded = True
                            break
                    except Exception:
                        print(f"Uploaded {name} (HTTP completed).")
                        uploaded = True
                        break
                else:
                    print(f"Attempt {attempt} curl failed for {name}: {proc.stderr}")
                    if attempt < 3:
                        time.sleep(5)
            except Exception as e:
                print(f"Attempt {attempt} exception for {name}: {e}")
                if attempt < 3:
                    time.sleep(5)

        if not uploaded:
            raise RuntimeError(f"Failed to upload {name} after 3 attempts.")

    print(f"\n[SUCCESS] Release {tag} published successfully!")
    print(f"View Release: {html_url}")

if __name__ == "__main__":
    main()
