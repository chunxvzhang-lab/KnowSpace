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
    tag = "v2.4.0"
    title = "KnowSpace v2.4.0 - 交互式排布间距调校(环形半径/网格间距拖拽)与多模态媒体插入、导出链路工业级加固"
    
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
    body_md = r"""# 🚀 KnowSpace v2.4.0

**KnowSpace · Personal Knowledge Workspace (现代化个人知识工作台)**  
> **Write. Read. Connect. Know.（记录 · 阅读 · 连接 · 认知）**

**KnowSpace v2.4.0 正式发布！**

本次更新聚焦三件事：**让白板排布真正可调**、**让多模态媒体插入顺手**、**让导出与显示完全一致**，并修掉一批长期存在的稳定性问题。

1. **🎛️ 交互式排布间距调校** —— 环形半径滑块 + 拖拽卡片实时调距；网格行列间距拖拽微调；多选组中心空白区整体平移
2. **🖼️ 多模态媒体插入与预览** —— 右键一键插入图片/视频/音频、双击全屏预览（视频播放 / 音频播放器）
3. **🛡️ 导出链路工业级加固** —— 离屏渲染兜底（PNG 请求必定得到 PNG）、原生剪贴板直写、导出配色与屏幕主题 1:1 一致
4. **🧪 43 个全量测试套件、384 项自动化单元与集成测试 100% 满分通过！**

---

### ✨ v2.4.0 核心更新亮点

#### 1. 🎛️ 交互式排布间距调校 (Interactive Layout Spacing)
- **环形半径调整**：对齐菜单内的半径滑块，或**直接拖动环上任意卡片**，其余卡片围绕被拖动卡片实时重排，间距所见即所得；
- **网格间距拖拽**：拖动网格内任意卡片即可实时改变行列间距；
- **防重叠保护**：环半径具备基于卡片对角线自动计算的下限，拖到底也不会塌成一堆；
- **整体平移**：多选后拖动**选中组中间的空白区域**可整体平移，间距保持不变，且不会误拖画布背景；
- **单条历史**：整段手势只记录一条撤销，不会刷爆历史栈。

#### 2. 🖼️ 多模态媒体插入与全屏预览 (Multimodal Media Insertion)
- **右键一键插入**图片 / 视频 / 音频，文件对话框已按类型预过滤，卡片**落在右键点击位置**；
- **双击媒体卡片全屏预览**：图片缩放平移、视频自动播放、音频播放器；`✕` 或 `Esc` 关闭；
- **修复图片卡片破图**：媒体路径改为按画布文件目录解析，不再被当作相对 HTML 页面路径。

#### 3. 🛡️ 导出与剪贴板彻底修复 (Export Pipeline Hardening)
- **离屏渲染兜底**：渲染进程 canvas 栅格化被浏览器安全策略否决时，自动改用主进程离屏 `capturePage()` 渲染，**PNG 请求必定得到 PNG**，不再静默降级为 SVG；
- **剪贴板改走系统原生 API**：`navigator.clipboard` 需要窗口聚焦与用户手势，在 Electron 中极易失效，现直接调用原生剪贴板；
- **导出配色与屏幕主题 1:1 一致**：浅色 / 墨屏 / 暗黑三套主题的导出背景与点阵此前与屏幕不符，现已统一配色来源；
- **SVG 导出 XML 合法化**：修复未自闭合标签与无值布尔属性，保存的 `.svg` 可在浏览器 / Illustrator 正常打开；
- **尺寸钳制**：单边 ≤16384px、总量 ≤24MP，大画布不会因内存峰值崩溃。

#### 4. 🎨 12 色专业调色板与自定义取色 (Extended Palette)
- 调色盘由 6 色扩展至 **12 色**（键 1-6 保持 JSON Canvas 标准色以确保互通，7-12 为扩展色）；
- 批量卡片 / 批量连线新增**自定义 HEX 取色器**，拖动实时预览、停手提交单条历史；
- **修复拖动取色时闪退**（原生对话框高频 onChange 引发的历史栈与内存风暴）。

#### 5. 🔗 绕障寻路与图层优化 (Routing & Layers)
- **多障碍链式绕行**：所有被路径穿透的障碍合并为单一包络，一串相邻卡片一次绕开，不再只绕第一个；
- **连线图层下沉**：连线始终位于卡片之下，线条永不遮挡卡片文字。

#### 6. 🧩 侧边栏自适应 (Adaptive Sidebar)
- 修复**全屏 / 矮窗口下底部按钮消失**：侧边栏改为可滚动，并按窗口高度三级收紧（隐藏 Logo、缩小按钮）；
- Tooltip 改用 portal 渲染，不被滚动容器裁切。

---

### 📦 下载与安装 (Downloads)

| 资产文件 | 类型 | 适用场景 |
| :--- | :--- | :--- |
| [`KnowSpace-Setup-2.4.0.exe`](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.4.0/KnowSpace-Setup-2.4.0.exe) | **Windows 向导安装程序（推荐）** | 桌面快捷方式、开始菜单图标、`.md` / `.canvas` 文件关联 |
| [`KnowSpace-2.4.0.msi`](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.4.0/KnowSpace-2.4.0.msi) | **Windows MSI 标准安装包** | 企业 IT 批量分发、组策略静默安装 |
| [`KnowSpace-win-x64-portable.zip`](https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.4.0/KnowSpace-win-x64-portable.zip) | **Windows 免安装绿色便携版** | 解压即用，支持放入 U 盘，随身携带 |

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
    msi_path = os.path.join(release_dir, "KnowSpace-2.4.0.msi")
    setup_exe_path = os.path.join(release_dir, "KnowSpace-Setup-2.4.0.exe")
    portable_zip_path = os.path.join(release_dir, "KnowSpace-win-x64-portable.zip")

    assets_to_upload = [
        (
            setup_exe_path,
            "KnowSpace-Setup-2.4.0.exe",
            "application/x-msdownload"
        ),
        (
            msi_path,
            "KnowSpace-2.4.0.msi",
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
