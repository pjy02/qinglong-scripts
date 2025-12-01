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
- **ACCK_ACCOUNTS**
- 说明：每行或使用 `&` 分隔一个账号
- 格式：`JWT_TOKEN#CF_TOKEN#备注(可选)`
- 示例：
  ```
  eyJhbGciOi...#cf_token_value#主号
  second_jwt_token#second_cf_token#小号
  ```

### 2. 单账号简写
- **ACCK_AUTHORIZATION**: 请求头 `authorization` 对应的 JWT Token
- **ACCK_CF_CLEARANCE**: Cookie 中的 `cf_clearance` 值

> 两种方式任选其一，若同时配置，则优先使用 `ACCK_ACCOUNTS`。

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
