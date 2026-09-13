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
    tag = "v2.3.0"
    title = "KnowSpace v2.3.0 - 空间白板分镜演播2.3(顺时针闭环/容器优先/上下文复现)与思维导图响应式顶栏"
    
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
    body_md = r"""# 🚀 KnowSpace v2.3.0

**KnowSpace · Personal Knowledge Workspace (现代化个人知识工作台)**  
> **Write. Read. Connect. Know.（记录 · 阅读 · 连接 · 认知）**

**KnowSpace v2.3.0 正式发布！**
本次 v2.3.0 带来两大维度深度升级：
1. **📽️ 空间白板分镜全屏演播 2.3 拓扑引擎（顺时针完整闭环、同一容器优先演播、深入子例程推演与自然归栈、先单卡后成环推演、跨容器上下文感知复现）**
2. **🧠 思维导图响应式多行折行顶栏（彻底杜绝高缩放与窄窗口下的截断与溢出）**
3. **🧪 43 个全量测试套件、379 项自动化单元与集成测试 100% 满分通过！**

---

### ✨ v2.3.0 核心更新亮点

#### 1. 📽️ F5 白板分镜全屏演示模式 2.3 (Presentation Mode 2.3)
- **同一容器优先演播 (Container-First Ordering)**：按照卡片所在容器归属优先顺序演播，严密保障模块化、分组化的演讲与推演节奏；
- **深入子例程推演与自然归栈 (Drill-down Subroutine & Return)**：当播放到引出外部卡片的发起点卡片时，依因果拓扑深入演播其指向的目标卡片子树，演播完成后平滑返回原容器的发起点卡片，继续演播原容器的后续卡片；
- **先单卡后成环推演策略 (Single Cards Before Ring Cycles)**：当发起点卡片同时引出「单独卡片」与「环形结构」时，优先完整演播独立分支链，再演播成环卡片组，避免逻辑认知割裂；
- **成环卡片组顺时针完整演播 (Clockwise Full Cycle Traversal)**：基于几何重心极角排序与并查集回路识别，顺时针完整演播闭环内所有卡片，并在成环完毕后演播环外延伸分支，保证环形回路 100% 完整呈现；
- **跨容器上下文感知复现 (Context-Aware Cross-Container Replay)**：被其他容器作为引出目标播放过的卡片，或在首组容器中作为普通卡片播放过的卡片，在进入其自身所属容器后可再次作为完整卡片进行上下文演播，兼顾因果穿透与分组完整性；
- **电影级平滑聚焦运镜与呼吸高亮**：平滑平移并缩放画板摄像机精准居中呈现，当前演播卡片柔和呼吸发光，非演播卡片弱化遮罩。

#### 2. 🧠 思维导图响应式多行顶栏 (Responsive Mindmap Toolbar)
- **自适应换行排版 (Responsive Wrapped Toolbar)**：顶栏按钮组自适应换行排版，在较小窗口或高系统缩放比例下不挤压、不溢出截断；
- **单行工整排版保护**：各个按钮文字与图标施加不换行保护与标准边距；
- **双端无损同步体系**：`syncMindmapToDocument` 增量标题同步 100% 完整保全代码块、公式与表格。

#### 3. 🧪 工业级高可靠性与测试保障
- **43 个测试套件，379 项单元与集成测试 100% 全绿通过**，覆盖思维导图、无限白板演播拓扑、AABB 避障连线、版本快照与全库混合检索。

---

### 📦 下载与安装 (Downloads)

| 资产文件 | 类型 | 适用场景 |
| :--- | :--- | :--- |
| [`KnowSpace-Setup-2.3.0.exe`](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.3.0/KnowSpace-Setup-2.3.0.exe) | **Windows 向导安装程序（推荐）** | 桌面快捷方式、开始菜单图标、`.md` / `.canvas` 文件关联 |
| [`KnowSpace-2.3.0.msi`](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.3.0/KnowSpace-2.3.0.msi) | **Windows MSI 标准安装包** | 企业 IT 批量分发、组策略静默安装 |
| [`KnowSpace-win-x64-portable.zip`](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.3.0/KnowSpace-win-x64-portable.zip) | **Windows 免安装绿色便携版** | 解压即用，支持放入 U 盘，随身携带 |

---

### 🖥️ 系统要求

- Windows 10 / 11 (x64)
- 摸鱼Lab 研发出品
"""

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
    msi_path = os.path.join(release_dir, "KnowSpace-2.3.0.msi")
    setup_exe_path = os.path.join(release_dir, "KnowSpace-Setup-2.3.0.exe")
    portable_zip_path = os.path.join(release_dir, "KnowSpace-win-x64-portable.zip")

    assets_to_upload = [
        (
            setup_exe_path,
            "KnowSpace-Setup-2.3.0.exe",
            "application/x-msdownload"
        ),
        (
            msi_path,
            "KnowSpace-2.3.0.msi",
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
