# ARM 设备防火墙管理工具

本项目提供一个在 Windows 10 平台运行的 Web 管理界面，
通过 SSH 访问 ARMv7l 设备并使用 `iptables` 命令获取、整理
以及维护防火墙规则。

## 功能特性

- 通过 `iptables -L -n --line-numbers` 自动分类整理链和规则。
- 支持将规则按链、按动作（目标）两种视图方式展示，界面简洁美观。
- 支持快速搜索端口、源/目的地址等关键信息。
- 支持新增、编辑（替换）与删除规则。
- 通过 Bootstrap 打造响应式界面，桌面与移动端均可友好展示。

## 快速开始

### 1. 准备运行环境

1. 安装 [Python 3.10+](https://www.python.org/downloads/windows/)（建议勾选
   `Add python.exe to PATH`）。
2. 安装依赖：

   ```powershell
   cd <项目目录>
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

### 2. 配置连接信息

1. 将 `config.example.json` 复制为 `config.json`。
2. 修改以下字段以匹配 ARM 设备信息：
   - `host`：设备 IP 或域名。
   - `username` / `password`：SSH 凭据（也可配置 `key_filename` 使用密钥登录）。
   - `port`：SSH 端口，默认 22。
   - `timeout`：连接超时时间（秒）。
   - `list_command`：获取规则的命令，默认 `iptables -L -n --line-numbers`。

### 3. 启动服务

```powershell
flask --app app run --host 0.0.0.0 --port 8000
```

或直接运行：

```powershell
python app.py
```

浏览器访问 `http://localhost:8000` 即可打开管理界面。

### 4. 管理防火墙规则

- **新增规则**：在左侧表单中选择链（如 INPUT），填写链后的参数片段
  （如 `-p tcp --dport 8080 -j ACCEPT`），可选地指定插入位置。
- **编辑规则**：在规则行中选择“编辑”后输入新的参数片段，系统将使用
  `iptables -R` 替换原规则。
- **删除规则**：点击“删除”将通过 `iptables -D` 删除对应行号的规则。
- **重新整理视图**：通过右侧“按链显示 / 重新整理（按动作）”切换视图，
  可以快速掌握不同动作（如 ACCEPT、DROP）对应的所有规则。

## 测试

解析器可直接使用提供的示例输出进行测试：

```powershell
pytest
```

## 安全注意事项

- 默认配置使用密码登录，建议在生产环境中改用 SSH 密钥并限制访问源。
- 所有操作均直接对真实防火墙生效，执行前请确认命令正确。
- 可结合系统任务计划或备份脚本定期导出 `iptables-save` 结果。

## 许可证

MIT License
