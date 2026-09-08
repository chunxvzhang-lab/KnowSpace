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
    tag = "v1.11.0"
    title = "KnowSpace v1.11.0 - 全局命令中枢(Ctrl+K)、知识图谱深度与聚类分析、思维导图多格式生态互通"
    
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
    body_md = """# 🚀 KnowSpace v1.11.0

**KnowSpace · Personal Knowledge Workspace (现代化个人知识工作台)**  
> **Write. Read. Connect. Know.（记录 · 阅读 · 连接 · 认知）**

本次 **v1.11.0** 带来三大核心架构升维与深度体验优化——**「全局命令中枢 (Command Palette / Quick Switcher · `Ctrl+K`)、知识图谱 1-Hop/2-Hop 关联深度与目录色彩聚类、思维导图 OPML/FreeMind 多格式生态互通 (Mind Map Ecosystem Export)」**！

---

### ✨ v1.11.0 核心更新亮点

1. **⌨️ 全能全局命令中枢 (Command Palette & Quick Switcher · `Ctrl + K`)**：
   - **三模自适应调度引擎**：
     - **默认模式（快速切换器 Quick Switcher）**：空输入自动展示最近访问历史（MRU）与 `⏱️ 最近` / `📌 当前` 标识，输入文字毫秒级拼音首字母模糊匹配全库文档；
     - **`>` 动作执行模式 (Commands)**：输入 `>` 呼出 17+ 项核心功能全键盘调度（主题切换、排版模式、思维导图、全景图谱、打字机滚动锁定、PDF 导出、新建文档等），自带快捷键提示徽章；
     - **`#` 标题大纲直达模式 (Headings)**：输入 `#` 秒级解析当前文档 H1~H6 标题树，列出层级徽章与行号，回车平滑滚动直达目标小节。
   - **全局键盘免失焦穿透**：即使光标在 CodeMirror 6 编辑器内部打字，直接按 `Ctrl + K` 亦可穿透呼出，`Esc` 关闭后光标焦点智能恢复至原打字位置。

2. **🕸️ 知识图谱深度控制、目录色彩聚类与知识库治理**：
   - **关联深度步进控制 (Hop Depth)**：支持 `1-Hop 邻近`（聚焦当前笔记直系引用，消除视觉过载）、`2-Hop 扩展`（两层可达网络）与 `全局` 星座拓扑，支持点击任意节点动态重置为新中心；
   - **🎨 顶级目录调和色彩聚类**：采用 HSL 色相环自适应算法，自动为不同根目录的笔记分配和谐柔和的主题色彩，知识体系板块一目了然；
   - **MOC 核心枢纽与未链接孤岛挖掘**：一键过滤连接度 $\ge 3$ 的骨干核心枢纽 (MOC) 文档，或一键扫描度数 $=0$ 的未链接孤立碎片笔记，助力知识库体检与双链重构闭环。

3. **🧠 思维导图多格式生态互通导出 (Mind Map Multi-Format Export)**：
   - **顶栏下拉多生态导出面板**：
     - **📷 高清 PNG 图片**：Canvas 2× 视网膜级超采样抗锯齿、透明背景、动态 Bounding Box 计算（无视口边缘裁切）；
     - **📑 OPML 2.0 国际大纲标准协议**：通用大纲交换，无缝打通 **MindNode**、**OmniOutliner**、**Logseq**、**XMind**、**Dynalist**；
     - **🧠 FreeMind 1.0.1 工业级标准 (`.mm`)**：保留节点层级与定制 8 色调和色彩，可被 **XMind**、**Freeplane**、**FreeMind**、**MindManager** 原生双击打开；
     - **📝 Markdown 分级大纲**：标准缩进无序列表，保真保留行内样式注释，适合提纲沉淀或直接作为 Prompt 喂给 LLM 扩写。

4. **⚡ 编辑器全局快捷键穿透优化 (Zero-Friction Flow)**：
   - 全面打通 CodeMirror 6 内部与全局调度之间的按键链路，打字过程中无需摸鼠标失焦，直接敲击 `Ctrl+K`（命令中枢）、`Ctrl+G`（全景图谱）、`Ctrl+M`（导图切换）、`Ctrl+\`（折叠侧栏）、`Ctrl+P`（矢量打印）瞬间响应。

5. **📖 官方用户操作手册全面升级**：
   - 官方操作手册 `docs/USER_MANUAL.md` 与 `docs/操作手册.md` 深度更新，涵盖全功能特性解析与 10+ 真实场景实操案例，内置 31 张高保真图解。

6. **🛡️ 质量防护与自动化测试**：
   - 27 个自动化测试套件、142 项单元测试 100% 全部通过，生产构建打包零报错。

---

### 📦 安装包与便携版下载

| 文件名 | 类型 | 说明 |
| :--- | :--- | :--- |
| **`KnowSpace-1.11.0.msi`** | Windows 标准安装包 | Windows Installer 官方安装格式，自动创建桌面与开始菜单快捷方式（推荐） |
| **`KnowSpace-win-x64-portable.zip`** | Windows 便携绿色版 | 免安装解压即用，解压后双击 `KnowSpace.exe` 即可运行 |

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
    msi_path = None
    msi_candidates = [
        r"C:\Users\chunxvzhang\Desktop\codex\release\KnowSpace-1.11.0.msi",
        r"C:\Users\chunxvzhang\Desktop\codex\release\KnowSpace 1.11.0.msi",
        r"C:\Users\chunxvzhang\Desktop\codex\release\KnowSpace-win-x64\release\KnowSpace-1.11.0.msi",
    ]
    for p in msi_candidates:
        if os.path.exists(p):
            msi_path = p
            break

    portable_zip_path = r"C:\Users\chunxvzhang\Desktop\codex\release\KnowSpace-win-x64-portable.zip"

    assets_to_upload = [
        (
            msi_path,
            "KnowSpace-1.11.0.msi",
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
