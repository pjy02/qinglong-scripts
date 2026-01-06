/**
 * 速维云签到脚本 for 青龙面板
 *
 * cron: 20 0 * * *
 * const $ = new Env('速维云签到');
 *
 * 环境变量说明:
 * 1. SVYUN_ACCOUNTS (推荐)
 *    - 支持多账号，使用换行或 & 分隔
 *    - 单个账号格式: TOKEN#COOKIE#备注
 *    - TOKEN 为抓包 Authorization 中的 JWT，可带或不带 Bearer 前缀
 *    - COOKIE 可选，缺省时自动使用 idcsmart_jwt={TOKEN}
 *    - 示例: eyJhbGci...#idcsmart_jwt=xxx; sl-session=xxx#主账号
 *
 * 2. 单账号简写
 *    - SVYUN_TOKEN: 对应请求头 authorization 的 JWT
 *    - SVYUN_COOKIE: 对应 cookie（可选）
 *    - SVYUN_REMARK: 账号备注（可选）
 *
 * 依赖: npm install axios
 */

const axios = require('axios');

let sendNotify;
try {
    sendNotify = require('./sendNotify.js').sendNotify;
} catch (error) {
    console.log('未找到 sendNotify.js，将使用 console.log 输出通知');
}

const CONFIG = {
    BASE_URL: 'https://www.svyun.com',
    TIMEOUT: 15000,
    USER_AGENT: process.env.SVYUN_USER_AGENT
        || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
    ORIGIN: 'https://www.svyun.com',
    REFERER: 'https://www.svyun.com/plugin/86/index.htm'
};

function log(message, level = 'INFO') {
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    console.log(`[${timestamp}] [${level}] ${message}`);
}

function normalizeToken(token) {
    if (!token) return '';
    const trimmed = token.trim();
    if (/^Bearer\s+/i.test(trimmed)) {
        return trimmed;
    }
    return `Bearer ${trimmed}`;
}

function rawJwt(token) {
    if (!token) return '';
    return token.replace(/^Bearer\s+/i, '').trim();
}

function parseAccounts() {
    const accounts = [];
    const raw = process.env.SVYUN_ACCOUNTS;

    if (raw) {
        const entries = raw.split(/[\n&]/).map(item => item.trim()).filter(Boolean);
        entries.forEach((entry) => {
            const parts = entry.split('#').map(part => part.trim());
            const [token, cookie, remark] = parts;
            if (!token) {
                log('发现空的账号配置，已跳过', 'WARN');
                return;
            }
            accounts.push({
                token: normalizeToken(token),
                cookie: cookie || '',
                remark: remark || `账号${accounts.length + 1}`
            });
        });
    }

    if (accounts.length === 0 && process.env.SVYUN_TOKEN) {
        accounts.push({
            token: normalizeToken(process.env.SVYUN_TOKEN),
            cookie: process.env.SVYUN_COOKIE ? process.env.SVYUN_COOKIE.trim() : '',
            remark: process.env.SVYUN_REMARK || '默认账号'
        });
    }

    return accounts.map(account => {
        if (!account.cookie) {
            const jwt = rawJwt(account.token);
            if (jwt) {
                account.cookie = `idcsmart_jwt=${jwt}`;
            }
        }
        return account;
    });
}

function buildHeaders(account, method = 'GET') {
    const headers = {
        authorization: account.token,
        'user-agent': CONFIG.USER_AGENT,
        accept: 'application/json, text/plain, */*',
        'x-requested-with': 'XMLHttpRequest',
        origin: CONFIG.ORIGIN,
        referer: CONFIG.REFERER
    };

    if (account.cookie) {
        headers.cookie = account.cookie;
    }

    if (method === 'POST') {
        headers['content-type'] = 'application/json';
    }

    return headers;
}

function isUnauthorized(status, data) {
    if (status === 401 || status === 403) return true;
    if (data && typeof data.status === 'number' && (data.status === 401 || data.status === 403)) return true;
    return false;
}

async function request(method, path, account, data) {
    try {
        const response = await axios({
            method,
            url: `${CONFIG.BASE_URL}${path}`,
            headers: buildHeaders(account, method),
            data,
            timeout: CONFIG.TIMEOUT,
            validateStatus: status => status >= 200 && status < 500
        });
        return { success: true, response };
    } catch (error) {
        return { success: false, error };
    }
}

async function fetchInfo(account, name) {
    const result = await request('GET', '/console/v1/daily_checkin/info', account);
    if (!result.success) {
        log(`【${name}】查询签到信息失败: ${result.error.message}`, 'ERROR');
        return { success: false, message: '查询签到信息失败' };
    }

    const { response } = result;
    if (isUnauthorized(response.status, response.data)) {
        return { success: false, message: '账号凭证已失效，请更新 Token/Cookie' };
    }

    if (!response.data || response.data.status !== 200) {
        return { success: false, message: `查询信息失败: ${JSON.stringify(response.data)}` };
    }

    return { success: true, data: response.data.data };
}

async function doCheckin(account, name) {
    const result = await request('POST', '/console/v1/daily_checkin/checkin', account, {});
    if (!result.success) {
        log(`【${name}】签到请求失败: ${result.error.message}`, 'ERROR');
        return { success: false, message: '签到请求失败' };
    }

    const { response } = result;
    if (isUnauthorized(response.status, response.data)) {
        return { success: false, message: '签到失败：账号凭证已失效' };
    }

    if (!response.data || response.data.status !== 200) {
        return { success: false, message: `签到失败: ${JSON.stringify(response.data)}` };
    }

    return { success: true, data: response.data.data, message: response.data.msg || '签到成功' };
}

async function handleAccount(account, index) {
    const name = account.remark || `账号${index + 1}`;
    const summary = {
        name,
        success: false,
        message: '',
        checked: false,
        streak: null,
        total: null
    };

    log(`开始处理【${name}】...`);

    const infoRes = await fetchInfo(account, name);
    if (!infoRes.success) {
        summary.message = infoRes.message;
        return summary;
    }

    const info = infoRes.data && infoRes.data.info;
    if (info && info.today_checked) {
        summary.success = true;
        summary.checked = true;
        summary.streak = info.current_streak;
        summary.total = info.total_checkins;
        summary.message = '今日已签到';
        log(`【${name}】今日已签到`);
        return summary;
    }

    const checkinRes = await doCheckin(account, name);
    if (!checkinRes.success) {
        summary.message = checkinRes.message;
        return summary;
    }

    const infoAfter = await fetchInfo(account, name);
    if (infoAfter.success && infoAfter.data && infoAfter.data.info) {
        summary.streak = infoAfter.data.info.current_streak;
        summary.total = infoAfter.data.info.total_checkins;
    }

    summary.success = true;
    summary.checked = true;
    summary.message = checkinRes.message;

    log(`【${name}】${checkinRes.message}`);
    return summary;
}

function buildNotifyContent(results) {
    let content = '🎯 速维云签到报告\n';
    content += `${'='.repeat(28)}\n`;

    results.forEach((res, idx) => {
        const status = res.success ? '✅' : '❌';
        content += `\n${idx + 1}. ${status} ${res.name}\n`;
        content += `   状态: ${res.message}\n`;
        if (res.total !== null && res.total !== undefined) {
            content += `   累计签到: ${res.total}\n`;
        }
        if (res.streak !== null && res.streak !== undefined) {
            content += `   连续签到: ${res.streak}\n`;
        }
    });

    content += `\n${'='.repeat(28)}\n`;
    content += `🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
    return content;
}

async function main() {
    const accounts = parseAccounts();
    if (accounts.length === 0) {
        log('未找到有效的速维云账号配置，请检查环境变量 SVYUN_ACCOUNTS 或 SVYUN_TOKEN', 'ERROR');
        return;
    }

    const results = [];
    for (let i = 0; i < accounts.length; i++) {
        const res = await handleAccount(accounts[i], i);
        results.push(res);
        if (i < accounts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const successCount = results.filter(item => item.success).length;
    log(`签到完成：成功 ${successCount}/${results.length}`);

    const notifyContent = buildNotifyContent(results);
    if (sendNotify) {
        try {
            await sendNotify('速维云签到结果', notifyContent);
        } catch (error) {
            log(`发送通知失败: ${error.message}`, 'ERROR');
        }
    } else {
        console.log(notifyContent);
    }
}

if (require.main === module) {
    main().catch(error => {
        log(`脚本执行异常: ${error.message}`, 'ERROR');
        process.exit(1);
    });
}

module.exports = { main };
