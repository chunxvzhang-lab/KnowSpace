"""
Generate a 21st.dev / Twitter theme inspired ultra-high-resolution hero showcase screenshot.
Dimensions: 2400 x 1350 (16:9, Ultra HD)
Uses Microsoft YaHei for perfect Chinese & English dual-language rendering.
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def get_font(size, bold=False):
    font_paths = [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size, index=0)
            except Exception:
                pass
    return ImageFont.load_default()

def draw_rounded_rect(draw, bbox, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(bbox, radius=radius, fill=fill, outline=outline, width=width)

def main():
    W, H = 2400, 1350
    img = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)

    # 1. Background: Deep Midnight Grid + Radial Glow (Twitter Blue #1D9BF0)
    glow_overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_overlay)
    
    # Draw radial glow circles at top center (x=1200, y=120)
    for r in range(800, 0, -20):
        alpha = int(48 * (1 - r / 800))
        glow_draw.ellipse(
            [1200 - r * 1.6, 120 - r * 0.9, 1200 + r * 1.6, 120 + r * 0.9],
            fill=(29, 155, 240, alpha)
        )
    img = Image.alpha_composite(img, glow_overlay)
    draw = ImageDraw.Draw(img)

    # Micro-grid dots in background
    for x in range(40, W, 48):
        for y in range(40, H, 48):
            draw.ellipse([x, y, x + 2, y + 2], fill=(47, 51, 54, 130))

    # 2. Header Badges (21st.dev Twitter Aesthetic)
    font_pill_title = get_font(24, bold=True)
    font_pill_sub = get_font(20, bold=False)
    font_badge = get_font(18, bold=True)

    # Top Central Floating Pill
    pill_w, pill_h = 860, 48
    pill_x = (W - pill_w) // 2
    pill_y = 38
    
    draw_rounded_rect(
        draw,
        [pill_x, pill_y, pill_x + pill_w, pill_y + pill_h],
        radius=24,
        fill=(15, 20, 25, 230),
        outline=(47, 51, 54, 255),
        width=1
    )
    # Glow dot
    draw.ellipse([pill_x + 22, pill_y + 18, pill_x + 34, pill_y + 30], fill=(29, 155, 240, 255))
    draw.text((pill_x + 46, pill_y + 10), "KnowSpace v1.11.0", fill=(231, 233, 234), font=font_pill_title)
    draw.text((pill_x + 305, pill_y + 12), "•  Personal Knowledge Workspace · 现代化知识工作台  •  摸鱼Lab", fill=(113, 118, 123), font=font_pill_sub)

    # Left & Right Top Badges
    draw_rounded_rect(draw, [120, 40, 420, 86], radius=23, fill=(15, 20, 25, 220), outline=(47, 51, 54, 255), width=1)
    draw.ellipse([140, 58, 150, 68], fill=(29, 155, 240, 255))
    draw.text((160, 50), "★ Ctrl+K 全局命令中枢", fill=(29, 155, 240), font=font_badge)

    draw_rounded_rect(draw, [W - 420, 40, W - 120, 86], radius=23, fill=(15, 20, 25, 220), outline=(47, 51, 54, 255), width=1)
    draw.ellipse([W - 400, 58, W - 390, 68], fill=(74, 222, 128, 255))
    draw.text((W - 380, 50), "★ / 指令与导图多格式生态", fill=(74, 222, 128), font=font_badge)

    # 3. Main Showcase Window Mockup (Twitter Lights Out #000000 + Surface #0f1419 + Border #2f3336)
    win_x = 120
    win_y = 112
    win_w = W - 240  # 2160
    win_h = H - 158  # 1192
    win_r = 18

    # Outer Drop Shadow Simulation
    shadow_img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow_img)
    s_draw.rounded_rectangle(
        [win_x - 12, win_y - 6, win_x + win_w + 12, win_y + win_h + 36],
        radius=win_r + 8,
        fill=(0, 0, 0, 190)
    )
    shadow_img = shadow_img.filter(ImageFilter.GaussianBlur(radius=32))
    img = Image.alpha_composite(img, shadow_img)
    draw = ImageDraw.Draw(img)

    # Main Window Container
    draw_rounded_rect(
        draw,
        [win_x, win_y, win_x + win_w, win_y + win_h],
        radius=win_r,
        fill=(0, 0, 0, 255),
        outline=(47, 51, 54, 255),
        width=1
    )

    # 3.1 Window Titlebar (Header)
    title_h = 56
    draw_rounded_rect(
        draw,
        [win_x, win_y, win_x + win_w, win_y + title_h],
        radius=win_r,
        fill=(11, 14, 20, 255)
    )
    draw.rectangle([win_x, win_y + 30, win_x + win_w, win_y + title_h], fill=(11, 14, 20, 255))
    draw.line([win_x, win_y + title_h, win_x + win_w, win_y + title_h], fill=(47, 51, 54, 255), width=1)

    # Traffic light dots
    draw.ellipse([win_x + 24, win_y + 21, win_x + 38, win_y + 35], fill=(248, 113, 113, 255))
    draw.ellipse([win_x + 46, win_y + 21, win_x + 60, win_y + 35], fill=(251, 191, 36, 255))
    draw.ellipse([win_x + 68, win_y + 21, win_x + 82, win_y + 35], fill=(74, 222, 128, 255))

    # Multi-tabs Bar directly rendered inside Header
    font_tab = get_font(15, bold=True)
    font_tab_normal = get_font(14, bold=False)
    font_subtab = get_font(13, bold=False)

    tabs = [
        ("01-架构与设计.md", False, False),
        ("02-AST双向零延迟同步.md", True, False),
        ("03-Mermaid图表导出.md", False, True),  # Dirty indicator
        ("04-对比分屏模式.md", False, False),
    ]

    tab_start_x = win_x + 110
    tab_cur_x = tab_start_x
    for name, is_active, is_dirty in tabs:
        t_width = 240 if is_active else 210
        t_y = win_y + 10
        t_h = title_h - 10
        if is_active:
            draw_rounded_rect(draw, [tab_cur_x, t_y, tab_cur_x + t_width, t_y + t_h], radius=8, fill=(0, 0, 0, 255), outline=(47, 51, 54, 255), width=1)
            draw.line([tab_cur_x + 1, t_y + t_h, tab_cur_x + t_width - 1, t_y + t_h], fill=(29, 155, 240, 255), width=2)
            draw.text((tab_cur_x + 16, t_y + 11), name, fill=(231, 233, 234), font=font_tab)
            draw.text((tab_cur_x + t_width - 24, t_y + 9), "×", fill=(113, 118, 123), font=get_font(16))
        else:
            draw_rounded_rect(draw, [tab_cur_x, t_y, tab_cur_x + t_width, t_y + t_h], radius=8, fill=(15, 20, 25, 200))
            draw.text((tab_cur_x + 16, t_y + 11), name, fill=(160, 166, 172), font=font_tab_normal)
            if is_dirty:
                draw.ellipse([tab_cur_x + t_width - 26, t_y + 15, tab_cur_x + t_width - 18, t_y + 23], fill=(245, 158, 11, 255))
            else:
                draw.text((tab_cur_x + t_width - 24, t_y + 9), "×", fill=(75, 80, 85), font=get_font(16))
        tab_cur_x += t_width + 8

    # Right Window Control Buttons (View Switcher Pills + Hash line number button)
    v_pill_x = win_x + win_w - 320
    # Line number toggle button in titlebar
    draw_rounded_rect(
        draw,
        [v_pill_x, win_y + 10, v_pill_x + 38, win_y + title_h - 10],
        radius=14,
        fill=(29, 155, 240, 40),
        outline=(29, 155, 240, 160),
        width=1
    )
    draw.text((v_pill_x + 13, win_y + 14), "#", fill=(29, 155, 240), font=get_font(17, bold=True))

    v_switch_x = v_pill_x + 50
    draw_rounded_rect(
        draw,
        [v_switch_x, win_y + 10, v_switch_x + 230, win_y + title_h - 10],
        radius=18,
        fill=(22, 24, 28, 255),
        outline=(47, 51, 54, 255),
        width=1
    )
    draw.text((v_switch_x + 20, win_y + 16), "阅读", fill=(113, 118, 123), font=font_subtab)
    # Active Split pill
    draw_rounded_rect(
        draw,
        [v_switch_x + 72, win_y + 12, v_switch_x + 154, win_y + title_h - 12],
        radius=14,
        fill=(29, 155, 240, 255)
    )
    draw.text((v_switch_x + 90, win_y + 16), "分屏", fill=(255, 255, 255), font=font_tab)
    draw.text((v_switch_x + 175, win_y + 16), "源码", fill=(113, 118, 123), font=font_subtab)

    # 3.2 Activity Bar (Leftmost Column, 68px)
    act_w = 68
    act_h = win_h - title_h - 38
    act_x = win_x
    act_y = win_y + title_h
    draw.rectangle([act_x, act_y, act_x + act_w, act_y + act_h], fill=(10, 13, 18, 255))
    draw.line([act_x + act_w, act_y, act_x + act_w, act_y + act_h], fill=(47, 51, 54, 255), width=1)

    # Logo Badge (paste real icon.png if exists)
    logo_path = r"C:\Users\chunxvzhang\Desktop\codex\icon.png"
    if os.path.exists(logo_path):
        try:
            logo_img = Image.open(logo_path).convert("RGBA").resize((38, 38), Image.Resampling.LANCZOS)
            img.paste(logo_img, (act_x + 15, act_y + 16), logo_img)
        except Exception:
            pass

    # Nav Icon pills (Directory, Outline, Bookmarks, Search)
    nav_labels = [("目录", True), ("大纲", False), ("书签", False), ("搜索", False)]
    for idx, (lbl, is_active) in enumerate(nav_labels):
        iy = act_y + 75 + idx * 56
        if is_active:
            draw_rounded_rect(draw, [act_x + 8, iy, act_x + act_w - 8, iy + 44], radius=12, fill=(29, 155, 240, 30))
            draw.line([act_x + 2, iy + 8, act_x + 2, iy + 36], fill=(29, 155, 240, 255), width=3)
        draw.text((act_x + 18, iy + 11), lbl, fill=(231, 233, 234) if is_active else (113, 118, 123), font=get_font(14, bold=is_active))

    # Bottom Settings & Theme in Activity Bar
    draw.text((act_x + 18, act_y + act_h - 90), "关于", fill=(113, 118, 123), font=get_font(13))
    draw_rounded_rect(draw, [act_x + 8, act_y + act_h - 48, act_x + act_w - 8, act_y + act_h - 10], radius=10, fill=(29, 155, 240, 40))
    draw.text((act_x + 16, act_y + act_h - 38), "主题", fill=(29, 155, 240), font=get_font(13, bold=True))

    # 3.3 Sidebar File Explorer (300px wide)
    side_w = 300
    side_x = act_x + act_w
    side_y = act_y
    draw.rectangle([side_x, side_y, side_x + side_w, side_y + act_h], fill=(15, 20, 25, 255))
    draw.line([side_x + side_w, side_y, side_x + side_w, side_y + act_h], fill=(47, 51, 54, 255), width=1)

    # Sidebar Header
    font_side_h = get_font(17, bold=True)
    font_side_item = get_font(15, bold=False)
    font_side_bold = get_font(15, bold=True)
    
    draw.text((side_x + 18, side_y + 18), "文档目录树", fill=(231, 233, 234), font=font_side_h)
    draw.text((side_x + side_w - 60, side_y + 18), "+ 新建", fill=(29, 155, 240), font=get_font(14, bold=True))

    # Search Box with Ctrl+K badge
    sbox_y = side_y + 54
    draw_rounded_rect(
        draw,
        [side_x + 14, sbox_y, side_x + side_w - 14, sbox_y + 36],
        radius=18,
        fill=(22, 24, 28, 255),
        outline=(47, 51, 54, 255),
        width=1
    )
    draw.text((side_x + 28, sbox_y + 7), "过滤章节...", fill=(113, 118, 123), font=get_font(14))
    draw_rounded_rect(draw, [side_x + side_w - 74, sbox_y + 6, side_x + side_w - 20, sbox_y + 30], radius=6, fill=(35, 40, 48, 255))
    draw.text((side_x + side_w - 68, sbox_y + 8), "Ctrl K", fill=(140, 150, 160), font=get_font(12, bold=True))

    # Tree items
    tree_items = [
        ("▼ 01-快速入门与核心架构", True, False),
        ("    01-应用概览与配置.md", False, False),
        ("    02-AST双向零延迟同步.md", False, True),  # Active
        ("    03-Mermaid与KaTeX.md", False, False),
        ("+ 02-高级技术架构 (4)", True, False),
        ("+ 03-安全原子落盘机制 (2)", True, False),
        ("+ 04-多主题与样式系统 (3)", True, False),
        ("+ 05-插件与扩展生态 (2)", True, False),
    ]
    for idx, (label, is_folder, is_active) in enumerate(tree_items):
        ty = side_y + 105 + idx * 36
        if is_active:
            draw_rounded_rect(
                draw,
                [side_x + 8, ty - 4, side_x + side_w - 8, ty + 30],
                radius=10,
                fill=(29, 155, 240, 35),
                outline=(29, 155, 240, 120),
                width=1
            )
            draw.line([side_x + 10, ty + 2, side_x + 10, ty + 24], fill=(29, 155, 240, 255), width=3)
            draw.text((side_x + 22, ty), label, fill=(29, 155, 240), font=font_side_bold)
        else:
            draw.text((side_x + 22, ty), label, fill=(231, 233, 234) if is_folder else (160, 166, 172), font=font_side_item)

    # 3.4 Main Workspace (Split View: Left CodeMirror 6 + Right Reader Canvas + Draggable Splitter)
    # Resizer 1: Between Sidebar and Workspace
    resizer1_x = side_x + side_w
    draw.rectangle([resizer1_x, act_y, resizer1_x + 6, act_y + act_h], fill=(22, 27, 34, 255))
    draw.line([resizer1_x + 3, act_y, resizer1_x + 3, act_y + act_h], fill=(47, 51, 54, 255), width=1)
    # Resizer handle glow in middle
    mid_y = act_y + act_h // 2
    draw_rounded_rect(draw, [resizer1_x + 1, mid_y - 20, resizer1_x + 5, mid_y + 20], radius=2, fill=(29, 155, 240, 220))

    ws_x = resizer1_x + 6
    ws_w = win_x + win_w - ws_x
    ws_y = act_y
    ws_h = act_h
    editor_w = int(ws_w * 0.44)

    # 3.4.1 Left Editor Workspace (CodeMirror 6)
    ed_x = ws_x
    draw.rectangle([ed_x, ws_y, ed_x + editor_w, ws_y + ws_h], fill=(0, 0, 0, 255))
    draw.line([ed_x + editor_w, ws_y, ed_x + editor_w, ws_y + ws_h], fill=(47, 51, 54, 255), width=1)

    # Editor Tab bar
    etab_h = 42
    draw.rectangle([ed_x, ws_y, ed_x + editor_w, ws_y + etab_h], fill=(11, 14, 20, 255))
    draw.line([ed_x, ws_y + etab_h, ed_x + editor_w, ws_y + etab_h], fill=(47, 51, 54, 255), width=1)
    # Active Tab
    draw.rectangle([ed_x + 10, ws_y + 4, ed_x + 280, ws_y + etab_h], fill=(0, 0, 0, 255))
    draw.line([ed_x + 10, ws_y + etab_h, ed_x + 280, ws_y + etab_h], fill=(29, 155, 240, 255), width=2)
    draw.text((ed_x + 24, ws_y + 11), "02-AST双向零延迟同步.md", fill=(231, 233, 234), font=get_font(14, bold=True))
    draw.text((ed_x + 258, ws_y + 11), "×", fill=(113, 118, 123), font=get_font(15))

    # Editor sync badge
    draw_rounded_rect(draw, [ed_x + editor_w - 145, ws_y + 8, ed_x + editor_w - 16, ws_y + 34], radius=13, fill=(29, 155, 240, 30), outline=(29, 155, 240, 160), width=1)
    draw.text((ed_x + editor_w - 132, ws_y + 10), "● 同步滚动: 开", fill=(29, 155, 240), font=get_font(13, bold=True))

    # Code lines in CodeMirror (Gutter + Code with syntax highlights)
    font_code = get_font(15, bold=False)
    font_code_bold = get_font(15, bold=True)
    code_lines = [
        (1, "# AST 双向零延迟同步架构", (29, 155, 240), False),
        (2, "", (255, 255, 255), False),
        (3, "采用 AST 语法树行号与精确像素映射算法。", (231, 233, 234), False),
        (4, "", (255, 255, 255), False),
        (5, "> [!TIP]", (113, 118, 123), False),
        (6, "> 彻底解决图表、公式与长篇段落的滚动漂移。", (160, 166, 172), False),
        (7, "", (255, 255, 255), False),
        (8, "## 架构时序设计", (29, 155, 240), False),
        (9, "", (255, 255, 255), False),
        (10, "```mermaid", (244, 114, 182), False),
        (11, "sequenceDiagram", (251, 146, 60), False),
        (12, "  autonumber", (148, 163, 184), False),
        (13, "  actor U as 编写者 (User)", (231, 233, 234), False),
        (14, "  participant CM as CodeMirror 6", (56, 189, 248), False),
        (15, "  participant AST as AST Sync Engine", (168, 85, 247), True), # Active line
        (16, "  participant R as Reader Canvas", (74, 222, 128), False),
        (17, "  U->>CM: 输入编辑内容与光标定位", (231, 233, 234), False),
        (18, "  CM->>AST: 发送源码行号与滚动比例", (231, 233, 234), False),
        (19, "  AST->>R: 双向精准行号插值定位 (0-Lag)", (29, 155, 240), False),
        (20, "  R-->>U: 丝滑高亮同步反馈", (74, 222, 128), False),
        (21, "```", (244, 114, 182), False),
        (22, "", (255, 255, 255), False),
        (23, "### 核心特性总结", (29, 155, 240), False),
        (24, "- [x] 100% 离线运行，安全原子落盘", (74, 222, 128), False),
    ]

    for line_no, text, color, is_active in code_lines:
        cy = ws_y + etab_h + 12 + (line_no - 1) * 25
        if cy > ws_y + ws_h - 20:
            break
        # Gutter number
        draw.text((ed_x + 18, cy), f"{line_no:2d}", fill=(113, 118, 123) if not is_active else (29, 155, 240), font=font_code)
        # Active line background
        if is_active:
            draw_rounded_rect(draw, [ed_x + 48, cy - 2, ed_x + editor_w - 6, cy + 22], radius=4, fill=(29, 155, 240, 25))
            draw.line([ed_x + 48, cy - 2, ed_x + 48, cy + 22], fill=(29, 155, 240, 255), width=2)
        # Code text
        draw.text((ed_x + 58, cy), text, fill=color, font=font_code_bold if is_active else font_code)

    # Resizer 2: Between Editor and Reader (Splitter Bar)
    resizer2_x = ed_x + editor_w
    draw.rectangle([resizer2_x, ws_y, resizer2_x + 6, ws_y + ws_h], fill=(22, 27, 34, 255))
    draw.line([resizer2_x + 3, ws_y, resizer2_x + 3, ws_y + ws_h], fill=(47, 51, 54, 255), width=1)
    # Active splitter glowing handle
    draw_rounded_rect(draw, [resizer2_x + 1, mid_y - 25, resizer2_x + 5, mid_y + 25], radius=2, fill=(29, 155, 240, 255))

    # 3.4.2 Right Reader Workspace (Rich Markdown Preview + Preview Line Numbers Gutter)
    rd_x = resizer2_x + 6
    reader_w = win_x + win_w - rd_x
    draw.rectangle([rd_x, ws_y, rd_x + reader_w, ws_y + ws_h], fill=(15, 20, 25, 255))

    # Reader Tab/Toolbar
    draw.rectangle([rd_x, ws_y, rd_x + reader_w, ws_y + etab_h], fill=(11, 14, 20, 255))
    draw.line([rd_x, ws_y + etab_h, rd_x + reader_w, ws_y + etab_h], fill=(47, 51, 54, 255), width=1)
    draw.text((rd_x + 24, ws_y + 11), "渲染预览 (正文行号自动显示)", fill=(231, 233, 234), font=get_font(14, bold=True))
    draw.text((rd_x + reader_w - 240, ws_y + 11), "🔢 行号: 显示 • 字号: 100% • UTF-8", fill=(113, 118, 123), font=get_font(13))

    # Preview Line Numbers Gutter Simulation
    gutter_w = 48
    draw.line([rd_x + gutter_w, ws_y + etab_h, rd_x + gutter_w, ws_y + ws_h], fill=(35, 40, 48, 180), width=1)

    # Reader Content Card
    rcard_x = rd_x + gutter_w + 24
    rcard_y = ws_y + etab_h + 18
    rcard_w = reader_w - gutter_w - 48
    
    # Line number 1 (Title)
    draw.text((rd_x + 14, rcard_y + 6), "1", fill=(29, 155, 240), font=get_font(12, bold=True))
    # Title
    font_h1 = get_font(28, bold=True)
    draw.text((rcard_x, rcard_y), "AST 双向零延迟同步架构", fill=(231, 233, 234), font=font_h1)
    draw.line([rcard_x, rcard_y + 42, rcard_x + 360, rcard_y + 42], fill=(29, 155, 240, 255), width=3)

    # Pill tags
    tag_y = rcard_y + 56
    draw_rounded_rect(draw, [rcard_x, tag_y, rcard_x + 130, tag_y + 28], radius=14, fill=(29, 155, 240, 30), outline=(29, 155, 240, 160), width=1)
    draw.text((rcard_x + 14, tag_y + 5), "● 摸鱼Lab 出品", fill=(29, 155, 240), font=get_font(13, bold=True))

    draw_rounded_rect(draw, [rcard_x + 140, tag_y, rcard_x + 305, tag_y + 28], radius=14, fill=(74, 222, 128, 30), outline=(74, 222, 128, 160), width=1)
    draw.text((rcard_x + 154, tag_y + 5), "● 正文行号自动映射", fill=(74, 222, 128), font=get_font(13, bold=True))

    # Line number 3 (Paragraph)
    draw.text((rd_x + 14, tag_y + 44), "3", fill=(113, 118, 123), font=get_font(12))
    # Body paragraph
    font_body = get_font(16, bold=False)
    draw.text((rcard_x, tag_y + 42), "BookMD Reader 采用创新分段线性插值算法与 AST 语法节点映射，", fill=(200, 205, 210), font=font_body)
    draw.text((rcard_x, tag_y + 68), "无论包含复杂 KaTeX 数学公式还是动态 Mermaid 图表，均可实现像素级高精度双向同步。", fill=(200, 205, 210), font=font_body)

    # Line number 5 (Callout Tip)
    draw.text((rd_x + 14, tag_y + 110), "5", fill=(113, 118, 123), font=get_font(12))
    # Tip Callout Box (Twitter Blue Callout)
    tip_y = tag_y + 106
    draw_rounded_rect(
        draw,
        [rcard_x, tip_y, rcard_x + rcard_w, tip_y + 70],
        radius=12,
        fill=(22, 24, 28, 255),
        outline=(47, 51, 54, 255),
        width=1
    )
    draw.line([rcard_x, tip_y + 2, rcard_x, tip_y + 68], fill=(29, 155, 240, 255), width=4)
    draw.text((rcard_x + 20, tip_y + 12), "核心优势 (Tip)", fill=(29, 155, 240), font=get_font(15, bold=True))
    draw.text((rcard_x + 20, tip_y + 38), "多栏自由拖拽调整边界 + 正文行号自动映射，长篇技术书籍与文档创作更高效。", fill=(160, 166, 172), font=get_font(14))

    # Line number 8 & 10 (Heading & Mermaid Diagram)
    draw.text((rd_x + 14, tip_y + 94), "10", fill=(29, 155, 240), font=get_font(12, bold=True))
    # Rendered Mermaid Diagram Card
    diag_y = tip_y + 90
    diag_h = 240
    draw_rounded_rect(
        draw,
        [rcard_x, diag_y, rcard_x + rcard_w, diag_y + diag_h],
        radius=14,
        fill=(11, 14, 20, 255),
        outline=(47, 51, 54, 255),
        width=1
    )
    # Diagram Header pill
    draw.text((rcard_x + 18, diag_y + 14), "Mermaid 时序交互图表 (实时渲染)", fill=(29, 155, 240), font=get_font(15, bold=True))
    draw_rounded_rect(draw, [rcard_x + rcard_w - 90, diag_y + 10, rcard_x + rcard_w - 18, diag_y + 36], radius=13, fill=(29, 155, 240, 30))
    draw.text((rcard_x + rcard_w - 76, diag_y + 14), "SVG 矢量", fill=(29, 155, 240), font=get_font(12, bold=True))

    # Diagram Participant Boxes
    p1_x = rcard_x + 40
    p2_x = rcard_x + int(rcard_w * 0.36)
    p3_x = rcard_x + int(rcard_w * 0.68)
    py = diag_y + 54

    for px, name, bg_col, txt_col in [
        (p1_x, "编写者 (User)", (22, 24, 28), (231, 233, 234)),
        (p2_x, "AST Sync Engine", (29, 155, 240), (255, 255, 255)),
        (p3_x, "Reader Canvas", (74, 222, 128), (15, 20, 25)),
    ]:
        draw_rounded_rect(draw, [px, py, px + 150, py + 34], radius=10, fill=bg_col, outline=(47, 51, 54, 255), width=1)
        draw.text((px + 16, py + 8), name, fill=txt_col, font=get_font(13, bold=True))
        # Lifelines
        draw.line([px + 75, py + 34, px + 75, diag_y + diag_h - 20], fill=(47, 51, 54, 180), width=1)

    # Message Arrows
    draw.line([p1_x + 75, py + 60, p2_x + 75, py + 60], fill=(29, 155, 240, 255), width=2)
    draw.polygon([(p2_x + 75, py + 60), (p2_x + 65, py + 55), (p2_x + 65, py + 65)], fill=(29, 155, 240, 255))
    draw.text((p1_x + 85, py + 42), "1. 标签分离 / 分屏同步", fill=(200, 210, 220), font=get_font(12))

    draw.line([p2_x + 75, py + 100, p3_x + 75, py + 100], fill=(74, 222, 128, 255), width=2)
    draw.polygon([(p3_x + 75, py + 100), (p3_x + 65, py + 95), (p3_x + 65, py + 105)], fill=(74, 222, 128, 255))
    draw.text((p2_x + 85, py + 82), "2. 毫秒级即时预读渲染", fill=(74, 222, 128), font=get_font(12))

    draw.line([p3_x + 75, py + 140, p1_x + 75, py + 140], fill=(168, 85, 247, 255), width=2)
    draw.polygon([(p1_x + 75, py + 140), (p1_x + 85, py + 135), (p1_x + 85, py + 145)], fill=(168, 85, 247, 255))
    draw.text((p1_x + 130, py + 122), "3. 丝滑视口渲染 & 双侧联动高亮", fill=(168, 85, 247), font=get_font(12))

    # 3.5 Bottom Dock Status Bar
    dock_y = win_y + win_h - 38
    draw.rectangle([win_x, dock_y, win_x + win_w, win_y + win_h], fill=(11, 14, 20, 255))
    draw.line([win_x, dock_y, win_x + win_w, dock_y], fill=(47, 51, 54, 255), width=1)

    # Dock items
    font_dock = get_font(13, bold=False)
    font_dock_bold = get_font(13, bold=True)
    draw.text((win_x + 20, dock_y + 10), "● 已安全保存 (原子落盘)", fill=(74, 222, 128), font=font_dock_bold)
    draw.text((win_x + 210, dock_y + 10), "2,840 字符  •  约 6 分钟阅读", fill=(160, 166, 172), font=font_dock)
    draw.text((win_x + win_w - 470, dock_y + 10), "LF  •  UTF-8  •  KnowSpace Engine v1.11.0  •  极客暗黑", fill=(113, 118, 123), font=font_dock)

    # 4. Floating Feature Showcase Cards around the main window
    # Left Floating Badge Card
    fc1_x = 45
    fc1_y = 580
    fc1_w = 260
    fc1_h = 160
    draw_rounded_rect(draw, [fc1_x, fc1_y, fc1_x + fc1_w, fc1_y + fc1_h], radius=16, fill=(15, 20, 25, 240), outline=(29, 155, 240, 160), width=2)
    draw.text((fc1_x + 20, fc1_y + 18), "★ 全局中枢与排版指令", fill=(29, 155, 240), font=get_font(17, bold=True))
    draw.text((fc1_x + 20, fc1_y + 50), "• Ctrl+K 瞬时检索并执行动作\n• / 斜杠指令快速插入组件\n• 极客右键上下文增强菜单\n• 双文档并排分屏对比模式", fill=(200, 205, 210), font=get_font(13))

    # Right Floating Badge Card
    fc2_x = W - 305
    fc2_y = 580
    fc2_w = 260
    fc2_h = 160
    draw_rounded_rect(draw, [fc2_x, fc2_y, fc2_x + fc2_w, fc2_y + fc2_h], radius=16, fill=(15, 20, 25, 240), outline=(29, 155, 240, 160), width=2)
    draw.text((fc2_x + 20, fc2_y + 18), "★ 图谱聚类与导图生态", fill=(29, 155, 240), font=get_font(17, bold=True))
    draw.text((fc2_x + 20, fc2_y + 50), "• 1-Hop / 2-Hop 关联探索\n• 文件夹多色社区聚类光环\n• 脑图多格式 OPML / FreeMind\n• 3x Retina 矢量超清导出", fill=(200, 205, 210), font=get_font(13))

    # 5. Save image to all required target paths
    target_paths = [
        r"C:\Users\chunxvzhang\Desktop\codex\screenshot.png",
        r"C:\Users\chunxvzhang\Desktop\codex\public\screenshot.png",
        r"C:\Users\chunxvzhang\Desktop\codex\dist\screenshot.png",
        r"C:\Users\chunxvzhang\Desktop\codex\release\KnowSpace-win-x64\screenshot.png",
        r"C:\Users\chunxvzhang\Desktop\codex\release\KnowSpace-win-x64\assets\screenshot.png",
        r"C:\Users\chunxvzhang\Desktop\codex\release\BookMD-Reader-win-x64\assets\screenshot.png",
    ]

    for tp in target_paths:
        os.makedirs(os.path.dirname(tp), exist_ok=True)
        img.save(tp, format="PNG")
        print(f"Saved hero screenshot: {tp} ({os.path.getsize(tp)/(1024):.1f} KB)")

    print("\n[DONE] Hero screenshot generated successfully!")

if __name__ == "__main__":
    main()
