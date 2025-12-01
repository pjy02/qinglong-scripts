/**
 * ACCK 签到脚本 for 青龙面板
 *
 * cron: 15 0 * * *
 * const $ = new Env('ACCK签到');
 *
 * 环境变量说明:
 * 1. ACCK_ACCOUNTS (推荐)
 *    - 支持多账号，使用换行或 & 分隔
 *    - 单个账号格式: JWT_TOKEN#CF_TOKEN#备注(可选)
 *    - 示例: eyJhbGciOi...#abc123...#小号\nsecond_jwt#second_cf_token#大号
 *
 * 2. 单账号简写
 *    - ACCK_AUTHORIZATION: 对应请求头 authorization 的 JWT_TOKEN
 *    - ACCK_CF_CLEARANCE:  对应 cookie 中的 cf_clearance
 *
 * 依赖: npm install axios
 */

const axios = require('axios');
const { sendNotify } = require('./sendNotify.js');

const CONFIG = {
    BASE_URL: 'https://sign-service.acck.io',
    TIMEOUT: 10000,
    USER_AGENT: 'Mozilla/5.0 (ACCK Sign Script)'
};

function log(message, level = 'INFO') {
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    console.log(`[${timestamp}] [${level}] ${message}`);
}

function parseAccounts() {
    const accounts = [];
    const raw = process.env.ACCK_ACCOUNTS;

    if (raw) {
        const entries = raw.split(/[\n&]/).map(item => item.trim()).filter(Boolean);

        entries.forEach((entry, index) => {
            const parts = entry.split('#');
            if (parts.length < 2) {
                log(`账号配置第 ${index + 1} 条格式错误，需使用 JWT#CF 格式`, 'WARN');
                return;
            }

            const [jwt, cf, remark] = parts.map(part => part.trim());
            if (!jwt || !cf) {
                log(`账号配置第 ${index + 1} 条缺少 JWT 或 CF_TOKEN`, 'WARN');
                return;
            }

            accounts.push({
                jwt,
                cf,
                remark: remark || `账号${accounts.length + 1}`
            });
        });
    }

    const singleJwt = process.env.ACCK_AUTHORIZATION;
    const singleCf = process.env.ACCK_CF_CLEARANCE;
    if (accounts.length === 0 && singleJwt && singleCf) {
        accounts.push({
            jwt: singleJwt.trim(),
            cf: singleCf.trim(),
            remark: '默认账号'
        });
    }

    return accounts;
}

function buildHeaders(account) {
    return {
        authorization: account.jwt,
        cookie: `cf_clearance=${account.cf}`,
        'user-agent': CONFIG.USER_AGENT
    };
}

async function request(path, headers, name) {
    try {
        const response = await axios.get(`${CONFIG.BASE_URL}${path}`, {
            headers,
            timeout: CONFIG.TIMEOUT,
            validateStatus: status => status >= 200 && status < 500
        });
        return { success: true, response };
    } catch (error) {
        log(`【${name}】请求 ${path} 失败: ${error.message}`, 'ERROR');
        return { success: false, error };
    }
}

async function handleAccount(account, index) {
    const name = account.remark || `账号${index + 1}`;
    const headers = buildHeaders(account);
    const result = {
        name,
        signed: false,
        success: false,
        points: null,
        message: ''
    };

    log(`开始处理【${name}】...`);

    const statusRes = await request('/api/acLogs/signStatus', headers, name);
    if (!statusRes.success) {
        result.message = '签到状态检查失败';
        return result;
    }

    const statusData = statusRes.response.data;
    const alreadySigned = statusData && statusData.data === true;

    if (alreadySigned) {
        log(`【${name}】今日已签到，跳过签到步骤`);
        result.signed = true;
    } else {
        const signRes = await request('/api/acLogs/sign', headers, name);
        if (!signRes.success) {
            result.message = '签到接口请求失败';
            return result;
        }

        const signBody = signRes.response.data;
        if (signBody && signBody.code === 200) {
            log(`【${name}】签到成功`);
            result.signed = true;
        } else {
            result.message = `签到失败: ${JSON.stringify(signBody)}`;
            return result;
        }
    }

    const infoRes = await request('/api/users/getUserInfo', headers, name);
    if (!infoRes.success) {
        result.message = '积分查询失败';
        return result;
    }

    const infoData = infoRes.response.data;
    const points = infoData && infoData.data && typeof infoData.data.jifen === 'number'
        ? infoData.data.jifen
        : null;

    result.points = points;
    result.success = true;
    result.message = alreadySigned ? '今日已签到' : '签到完成';

    return result;
}

function buildNotifyContent(results) {
    let content = '🎯 ACCK 自动签到报告\n';
    content += `${'='.repeat(28)}\n`;

    results.forEach((res, idx) => {
        const status = res.success ? '✅' : '❌';
        content += `\n${idx + 1}. ${status} ${res.name}\n`;
        content += `   状态: ${res.message}\n`;
        if (res.points !== null && res.points !== undefined) {
            content += `   当前积分: ${res.points}\n`;
        }
    });

    content += `\n${'='.repeat(28)}\n`;
    content += `🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
    return content;
}

async function main() {
    const accounts = parseAccounts();
    if (accounts.length === 0) {
        log('未找到有效的 ACCK 账号配置，请检查环境变量 ACCK_ACCOUNTS 或 ACCK_AUTHORIZATION/ACCK_CF_CLEARANCE', 'ERROR');
        return;
    }

    const results = [];
    for (let i = 0; i < accounts.length; i++) {
        const res = await handleAccount(accounts[i], i);
        results.push(res);
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    const successCount = results.filter(item => item.success).length;
    log(`签到完成：成功 ${successCount}/${results.length}`);

    const notifyContent = buildNotifyContent(results);
    try {
        await sendNotify('ACCK 签到结果', notifyContent);
    } catch (error) {
        log(`发送通知失败: ${error.message}`, 'ERROR');
    }
}

if (require.main === module) {
    main().catch(error => {
        log(`脚本执行异常: ${error.message}`, 'ERROR');
        process.exit(1);
    });
}

module.exports = { main };
