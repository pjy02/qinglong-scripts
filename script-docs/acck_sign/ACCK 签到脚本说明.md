# ACCK 签到脚本说明

## 功能简介
- 自动检测 ACCK 今日签到状态并在未签到时完成签到
- 支持多账号循环执行
- 调用官方接口查询当前积分并推送通知

## 定时任务示例
```cron
15 0 * * * node acck_sign.js
```

## 环境变量配置
### 1. 多账号配置（推荐）
在青龙面板 `环境变量` 中添加：

```
变量名: ACCK_ACCOUNTS
变量值: AUTHORIZATION#CF_CLEARANCE\nAUTHORIZATION#CF_CLEARANCE
```

- **分隔说明**：
  - 行内依次填写 authorization 与 cf_clearance，中间用 `#` 分隔，缺少任意一段都会触发格式错误。
  - 多个账号请用换行分隔；如需单行填写，可用 `&` 将完整账号串隔开，但顺序和 `#` 分隔规则不变。

> 如果开启自动获取 cf_clearance（见下方 `ACCK_AUTO_FETCH_CF`），且暂时没有可用的 cf_clearance，可以只填写 `AUTHORIZATION#`，脚本会尝试用无头浏览器去拿新的 cf_clearance。

示例：
```
eyJhbGciOi...#cf_token_value
second_jwt_token#second_cf_token
```

如果想写在一行：
```
eyJhbGciOi...#cf_token_value&second_jwt_token#second_cf_token
```

### 2. 单账号简写
如果只用一个账号，可以分成两个变量配置：

```
变量名: ACCK_AUTHORIZATION
变量值: <JWT_TOKEN>

变量名: ACCK_CF_CLEARANCE
变量值: <CF_TOKEN>
```

> 两种方式任选其一，若同时配置，则优先使用 `ACCK_ACCOUNTS`。

### 3. 自动获取 cf_clearance（可选）
```
变量名: ACCK_AUTO_FETCH_CF
变量值: true
```

- 设置为 `true` 后，脚本会在缺少 cf_clearance 或遇到 401/403 时，使用 **playwright-chromium** 启动无头浏览器访问 ACCK 接口，自动提取新的 `cf_clearance` 并重试。
- 依赖安装：
  ```bash
  npm install playwright-core playwright-chromium
  ```
- 注意：该方法只能帮助获取 Cloudflare 的 `cf_clearance`，仍需手动准备有效的 `authorization`（JWT Token）。

## 依赖安装
```bash
npm install axios
```

## 返回示例
- 签到成功: `{"msg":"签到成功","code":200}`
- 已签到: 查询 `/api/acLogs/signStatus` 返回 `{"code":200,"data":true}`

## 注意事项
1. 请确保 JWT Token 与 cf_clearance 保持最新，否则可能导致签到失败。
2. 如果使用青龙面板，建议将敏感信息存储在环境变量中，避免直接写入脚本。
3. 脚本会在最后推送汇总通知，方便查看各账号的执行情况。
4. 官方暂无刷新/登录 API，脚本只能在接口返回 401/403 时提示凭证过期，请手动重新获取 `authorization` 与 `cf_clearance` 后更新环境变量。
