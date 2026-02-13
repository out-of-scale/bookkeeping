# 计件工资记账 App - 需求说明书

## 项目概述
基于 Flet 框架开发的计件工资记账应用，主要运行在 Android 平台，使用 SQLite 数据库存储数据。支持工人管理、计件记账、历史记录查询、数据导出和统计报表等功能。

## 技术栈
- 框架：Flet
- 数据库：SQLite
- 目标平台：Android

---

## 核心需求

### 1. 输入键盘配置
- 所有数字输入框需使用 `flet.KeyboardType.NUMBER` 键盘类型
- 确保用户输入工资或数量时自动弹出数字键盘

### 2. 防误触机制
- **保存按钮行为**：记账保存按钮点击后需执行以下操作：
  - 清空所有输入框内容
  - 关闭弹窗
  - 防止用户连续多次点击导致重复录入

### 3. 数据持久化路径
- **数据库文件路径**：不要使用当前相对目录
- **路径规范**：使用 Android 系统推荐的用户数据目录或文档目录
- **目的**：确保 App 更新时数据不丢失

---

## 开发注意事项

1. **数据库路径获取**（Flet/Python）：
   ```python
   # 推荐使用 get_data_dir() 获取应用数据目录
   from pathlib import Path

   data_dir = Path(app.user_data_dir)  # 或使用 platformdirs 等库
   db_path = data_dir / "bookkeeping.db"
   ```

2. **保存按钮逻辑示例**：
   ```python
   def on_save(e):
       # 保存数据逻辑
       save_to_database(...)

       # 清空输入框
       input_field.value = ""

       # 关闭弹窗
       dialog.open = False
       page.update()
   ```

3. **数字键盘设置**：
   ```python
   ft.TextField(
       keyboard_type=ft.KeyboardType.NUMBER,
       ...
   )
   ```

---

## 数据模型

### 1. 工人表 (workers)
| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER PRIMARY KEY | 工人ID（自增）|
| name | TEXT NOT NULL UNIQUE | 工人姓名 |
| created_at | TIMESTAMP | 创建时间 |

### 2. 记账记录表 (records)
| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER PRIMARY KEY | 记录ID（自增）|
| date | TEXT NOT NULL | 日期 (YYYY-MM-DD) |
| worker_name | TEXT NOT NULL | 工人姓名 |
| work_content | TEXT NOT NULL | 工作内容 |
| quantity | REAL NOT NULL | 数量 |
| unit_price | REAL NOT NULL | 单价 |
| total_price | REAL NOT NULL | 总价（自动计算） |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

---

## 功能模块

### 1. 工人管理
- 工人列表展示
- 添加工人
- 删除工人（无记录的工人）
- 记账时从工人列表选择

### 2. 记账功能
- 入口：右下角浮动按钮（+）
- 表单字段：日期、工人姓名（下拉选择）、工作内容、数量、单价
- 总价自动计算（数量 × 单价）
- 保存后清空输入框并关闭弹窗
- 防重复提交机制

### 3. 历史记录
- 记录列表展示
- 支持筛选条件：
  - 按日期范围
  - 按工人姓名
  - 按工作内容
- 支持修改记录
- 支持删除记录

### 4. 统计报表（首页）
- 按日期范围统计
- 按工人统计（每个工人的总数量、总金额）
- 按工作内容统计（每个项目的总数量、总金额）

### 5. 数据导出
- 支持导出为 CSV 格式
- 支持导出为 Excel 格式（可选）

---

## 界面布局

### 首页
- 顶部：标题栏 "计件工资记账"
- 中部：统计数据概览
  - 日期范围选择
  - 工人统计列表
  - 工作内容统计列表
- 右下角：浮动按钮（+）打开记账弹窗
- 底部：标签栏（统计、历史记录、设置）

### 历史记录页
- 顶部：筛选条件（日期、工人、工作内容）
- 中部：记录列表
- 点击记录可查看详情/编辑/删除

### 设置页（可选）
- 工人管理

---

## 待补充需求
（可在此处添加后续讨论的需求）
