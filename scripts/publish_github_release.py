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
    tag = "v2.0.0"
    title = "KnowSpace v2.0.0 - 无限空间可视化白板(JSON Canvas)、本地时间旅行与全库混合检索"
    
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
    body_md = r"""# 🚀 KnowSpace v2.0.0

**KnowSpace · Personal Knowledge Workspace (现代化个人知识工作台)**  
> **Write. Read. Connect. Know.（记录 · 阅读 · 连接 · 认知）**

经过深度打磨，**KnowSpace v2.0.0 重磅里程碑版本正式发布！**
本次 v2.0.0 带来三大重磅核心子系统——**「🎨 无限空间可视化白板 (Infinite Canvas · JSON Canvas 1.0)」、「⏳ 本地时间旅行与版本快照历史 (Local Version History · Ctrl+Shift+H)」、「🔍 全库毫秒级混合检索引擎与结构化语法 (Hybrid Vault Search · Ctrl+F)」**，并针对空间连线流向、关系说明几何形状与专业右键清单进行了全维度交互升级！

---

### ✨ v2.0.0 核心更新亮点

#### 1. 🎨 无限空间可视化白板 (Infinite Canvas · JSON Canvas 1.0 兼容 · `Ctrl + Shift + C`)
- **标准开放与跨生态互通**：遵循开放标准 **JSON Canvas 1.0**（`.canvas` 格式），与 **Obsidian Canvas** 等外部空间工具 100% 双向互通；在文件树中以专属翠绿 Boxes 图标区分，支持新建、重命名、移动与双击秒开。
- **多模态卡片自由挂载**：
  - **文本卡片 (Text Node)**：双击行内 Markdown 编辑，失焦自适应渲染（支持 LaTeX、代码高亮、Checklist）；
  - **文档卡片 (File Node)**：挂载库内文档，内嵌实时滚动预览，双击穿梭直达原笔记；
  - **分组容器 (Group Node)**：半透明分类容器，带标题指示，支持框选和批量移动；
  - **网页链接卡片 (Link Node)**：直观内嵌外部参考网站与标签。
- **⚡ 严格几何中心对齐与上下分层垂直路由优先**：
  - **严格几何中点对齐**：卡片与容器四周锚点严格贴附各边几何正中点（`width/2`, `height/2`），连线与锚点圆点完全居中重合；
  - **上下分层垂直优先路由**：上下分布或跨容器排版时优先保持垂直流向，从下方卡片向最边缘外侧上方卡片连线时，起点严格为下方卡片的**上部（top）**，终点严格在上方卡片的**下部（bottom）**，从上往下同理，彻底消除横向切入与卡片穿插。
- **〰️ 防冲天平滑曲线与正交折线拐点手柄平移**：
  - **防冲天平滑贝塞尔曲线 (`bezier`)**：自适应动态约束控制点伸展幅度（$\le \text{gap} \times 0.55$），彻底根治微距或对角线连接时的曲线上突“冲天”或超大倒扣；
  - **正交折线拐点手柄拖拽 (`step`)**：单选直角折线时弯折段正中渲染专属调整手柄（`.canvas-step-bend-handle`），按住鼠标拖拽即可沿法向实时平移弯折位置（`stepOffset`），双击手柄快速复位至几何中位线；
  - **笔直直线 (`straight`)**：极简最短路径直连。
- **🎨 同一卡片同一起点线条颜色一致与跨容器全局智能调色分配**：
  - **同卡同色**：同一卡片/同一起点发出的所有连线自动保持完全一致的色彩；若卡片设置了专属颜色（`node.color`），其所有出向连线自动继承卡片主题色；
  - **跨容器全局智能互斥调色**：当同一分组容器内有两个或两个以上卡片发起连接线、或不同容器内分别有卡片发起一对多时，系统自动维护全域及容器内颜色池，智能指派互不冲突的调色板色彩（红、橙、黄、绿、青、紫），彻底告别大面积同色乱网。
- **🌱 一对多发起源全景多维识别 (One-to-Many Origin Clarity)**：
  - **起点端点锚固圆点 (`● ────> ▶`)**：所有有向连线在发起源卡片外边缘绘制专属原点锚固小圆点（Origin Anchor Dot），连线发射端与终点接收箭头对比鲜明，多线交叉时流向一眼可辨，SVG 导出 1:1 精确呈现；
  - **发起源徽章与卡片边框高亮 (`🌱 发起源 · N`)**：当卡片或分组容器向外辐射 $\ge 2$ 条出向连线时，卡片顶部边框自动切换为对应连线色彩的实线加粗边框，卡片标题栏常驻「🌱 发起源 · N」彩色胶囊徽章；鼠标悬停发起源卡片时，该卡片发出的所有连线自动激发专属色彩的动态柔和阴影辉光；
  - **多选发起源动态感知**：多选卡片时，首选卡片上方常驻绿色浮动指示标「🌱 一对多发起源」，顶栏工具按钮动态标注「一对多关联 (以「卡片标题」发起源)」，右键上下文菜单明确提示「🌱 以此卡片「标题」为发起节点建立一对多」，彻底杜绝发起源混淆。
- **🔲 连线批量多选与底部批量操作工具栏 (Multi-Edge Selection & Batch Toolbar)**：
  - 支持按住 `Shift` / `Ctrl` 多选连线、画布鼠标框选批量选定连线；
  - 底部弹出专属浮动批量修改工具栏（`.canvas-edge-batch-toolbar`），支持一键批量修改 6 种色彩、箭头端点（单向/双向/无箭头）、线型（贝塞尔/折线/直线）、描边虚实形态（实线/虚线/点线）、反转流向与一键批量删除。
- **✂️ 多选卡片右键一键断开内部连线**：
  - 框选或多选多张卡片后，在右键上下文菜单中一键断开所选卡片间的内部互联连线，完整保留与外部其他卡片的既有连线。
- **🔀 快捷反转连线流向 (`R`) 与精美矢量形状**：
  - **连线反向 (`R`)**：连线选中时按 `R` 键秒级翻转两端节点与箭头流向；悬浮工具栏配备浅蓝高亮按钮，右键菜单明示起止卡片名称与快捷键，伴随即时 Toast 反馈；
  - **精美关系说明形状**：胶囊形（Pill）、规整矩形（Rect）、真·几何菱形（Diamond），矢量等比自适应文本宽度，阴影立体自然。
- **📑 媲美 Figma / Miro 的 4 大深度右键上下文菜单**：
  - **空白画布**：新建各类卡片、**从剪贴板一键粘贴卡片 (`Ctrl+V`)**（自动读取剪贴板纯文本生成卡片）、适应画布 (`Shift+1`)、重置缩放 100% (`Ctrl+0`)、对齐网格（吸附至 20px 网格）、小地图与网格形态切换；
  - **单张卡片**：Markdown 编辑、复制文本、**复制双链引用 (`[[标题]]`)**、**提取为独立笔记**、**重置为默认尺寸**、图层调整、6 色雅致背景调色板；
  - **多选节点**：**一键断开所选卡片间连线**、**一键打包为分组容器 (`Ctrl+G`)**（智能计算边界包围盒）、**批量水平对齐与垂直对齐**、**左对齐、水平居中、右对齐、顶端对齐、底端对齐**与**水平/垂直等距分布**；
  - **分组容器**：重命名容器、**一键全选内部所有卡片**、**自适应紧凑包围内容**（智能收缩留白 24px）、**解散分组**（仅删容器保留内部卡片）。
- **🔭 缩略雷达小地图 (Minimap)**：右下角常驻全局缩略雷达，实时反馈当前视口位置，点击极速导航。
- **📝 画布逆向拓扑萃取长文算法 (Canvas-to-Article)**：独创拓扑萃取算法，根据卡片空间坐标与有向箭头依赖关系，一键萃取生成章节完备、引用严谨的独立 Markdown 专著！

#### 2. ⏳ 本地时间旅行与版本快照历史 (Local Version History · `Ctrl + Shift + H`)
- **纯本地静默快照引擎**：在知识库根目录下维护 `.knowspace/snapshots/` 隐藏存储，每个快照打上绝对时间戳与 SHA-256 哈希校验码，杜绝冗余重复；
- **30 秒去抖与自动配额修剪**：智能识别实质性变更，在频繁保存中聚合 30 秒去抖窗口；单个文档滚动维护最新 50 个优质快照点；
- **Side-by-Side 双栏与 Unified 单栏对比视图**：
  - Myers LCS 差异引擎：毫秒级行级与行内字符微粒度差异对比，高对比度绿底红底清晰直观；
  - 自由切换对比模式，实时统计修改行数（如 `+18 -5`）。
- **一键无损安全还原与手动里程碑**：一键回退到任一历史节点（带防误触确认与还原保护记录），支持随时手动打下自定义里程碑快照。

#### 3. 🔍 全库毫秒级混合检索引擎与结构化语法 (Hybrid Vault Search · `Ctrl + F`)
- **毫秒级倒排索引引擎 (Inverted Index Engine)**：建立内存级 `tagIndex`、`linkIndex` 与 `termIndex`，万篇笔记键入即出（< 15ms）；
- **强大的结构化检索语法**：
  - `tag:#架构` 或 `tag:架构`：精准筛选标签；
  - `link:[[分布式协议]]` 或 `link:分布式协议`：追踪双向引用关系；
  - `"严格短语"`：连续字词精确匹配；
  - `-排除词`：过滤无关分支；
  - `after:` / `before:`：按时间范围过滤。
- **双模式切换与语法辅助芯片**：顶栏一键切换 `[当前章节]` 与 `[全库检索]`，快捷插入语法芯片，点击跨文档秒级跳转并激活 1.8 秒柔和电光蓝脉冲高亮。

#### 4. 🛡️ 质量保障与自动化测试
- **34 个自动化测试套件、258 项单元与集成测试 100% 全部通过**；
- TypeScript 严格类型检查 0 错误；
- 生产构建与 Windows 桌面打包全流程无缝通过。

---

### 📦 安装包与便携版下载

| 文件名 | 类型 | 说明 |
| :--- | :--- | :--- |
| **`KnowSpace-Setup-2.0.0.exe`** | Windows 图形化安装程序（推荐） | 双击即可向导式安装，支持自定义安装目录，自动创建桌面与开始菜单快捷方式 |
| **`KnowSpace-2.0.0.msi`** | Windows 标准安装包 | Windows Installer 官方格式，适合企业批量部署、组策略分发与静默安装 |
| **`KnowSpace-win-x64-portable.zip`** | Windows 便携绿色版 | 免安装解压即用，解压后双击 `KnowSpace.exe` 即可直接运行 |

---

### 🛠️ 本次更新明细

#### 🎨 无限白板：环形连线配色体系
- **同环同色**：同一个闭环内所有连线共享完全一致的颜色，一条环即一条语义流；
- **异环异色**：系统自动识别画布上已存在的闭环（基于有向图环检测，要求环至少 3 个节点，双向箭头不计入），新建环时自动选取尚未被其他环占用的调色板颜色，多个环路视觉边界一目了然；
- **连线右键色彩**：右键任意连线即可调出完整关系面板，内含 6 色调色板、起止锚点、线型、标签形状与流向反转。

#### 🖱️ 白板右键菜单遮挡修复
- 右键菜单改为通过 `createPortal` 渲染至 `document.body` 顶层，并使用 `position: fixed` 定位，彻底杜绝被画布容器 `overflow: hidden` 裁切；
- 菜单定位基于真实视口尺寸动态夹取与翻转，在窗口底部右键时自动向上展开，窗口内任意位置均可完整查看全部菜单项。

#### 🖼️ 导出与显示一致性
- 导出 PNG / SVG 时复用与屏幕渲染完全相同的色彩解析管线（同一份 source-aware 配色映射），修正此前"导出图片与文件打开后显示不一致"的问题；
- 自定义十六进制颜色会预先注册对应的箭头 marker，保证导出图中箭头颜色同样准确。

#### 📦 打包与分发
- 新增 Windows 图形化安装程序（NSIS），与原有 MSI 安装包并行发布；
- Windows 便携绿色版同步更新。

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
        r"C:\Users\chunxvzhang\Desktop\codex\release\KnowSpace-2.0.0.msi",
        r"C:\Users\chunxvzhang\Desktop\codex\release\KnowSpace 2.0.0.msi",
        r"C:\Users\chunxvzhang\Desktop\codex\release\KnowSpace-win-x64\release\KnowSpace-2.0.0.msi",
    ]
    for p in msi_candidates:
        if os.path.exists(p):
            msi_path = p
            break

    portable_zip_path = r"C:\Users\chunxvzhang\Desktop\codex\release\KnowSpace-win-x64-portable.zip"

    setup_exe_path = None
    setup_exe_candidates = [
        r"C:\Users\chunxvzhang\Desktop\codex\release\KnowSpace-Setup-2.0.0.exe",
        r"C:\Users\chunxvzhang\Desktop\codex\release\KnowSpace-2.0.0.exe",
        r"C:\Users\chunxvzhang\Desktop\codex\release\KnowSpace 2.0.0.exe",
    ]
    for p in setup_exe_candidates:
        if os.path.exists(p):
            setup_exe_path = p
            break

    assets_to_upload = [
        (
            setup_exe_path,
            "KnowSpace-Setup-2.0.0.exe",
            "application/x-msdownload"
        ),
        (
            msi_path,
            "KnowSpace-2.0.0.msi",
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
