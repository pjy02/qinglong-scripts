/**
 * ACCK 签到脚本 for 青龙面板
 *
 * cron: 15 0 * * *
 * const $ = new Env('ACCK签到');
 *
 * 环境变量说明:
 * 1. ACCK_ACCOUNTS (推荐)
 *    - 支持多账号，使用换行或 & 分隔
 *    - 单个账号格式: AUTHORIZATION#CF_CLEARANCE
 *    - 若开启 ACCK_AUTO_FETCH_CF 且暂缺 cf_clearance，可填 AUTHORIZATION#，脚本会尝试自动获取
 *    - 示例: eyJhbGciOi...#abc123...\nsecond_jwt#second_cf_token
 *
 * 2. 单账号简写
 *    - ACCK_AUTHORIZATION: 对应请求头 authorization 的 JWT_TOKEN
 *    - ACCK_CF_CLEARANCE:  对应 cookie 中的 cf_clearance
 *
 * 3. 可选自动获取 cf_clearance
 *    - ACCK_AUTO_FETCH_CF=true 启用，需要安装 playwright-chromium & playwright-core
 *
 * 依赖: npm install axios
 */

const axios = require('axios');
const { sendNotify } = require('./sendNotify.js');

const CONFIG = {
    BASE_URL: 'https://sign-service.acck.io',
    TIMEOUT: 10000,
    USER_AGENT: 'Mozilla/5.0 (ACCK Sign Script)',
    AUTO_FETCH_CF: String(process.env.ACCK_AUTO_FETCH_CF || '').toLowerCase() === 'true'
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
            if (parts.length < 2 && !CONFIG.AUTO_FETCH_CF) {
                log(`账号配置第 ${index + 1} 条格式错误，需使用 JWT#CF 格式`, 'WARN');
                return;
            }

            const [jwt, cf, remark] = parts.map(part => part.trim());
            if (!jwt) {
                log(`账号配置第 ${index + 1} 条缺少 JWT`, 'WARN');
                return;
            }
            if (!cf && !CONFIG.AUTO_FETCH_CF) {
                log(`账号配置第 ${index + 1} 条缺少 CF_TOKEN`, 'WARN');
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
    if (accounts.length === 0 && singleJwt) {
        if (!singleCf && !CONFIG.AUTO_FETCH_CF) {
            log('单账号配置缺少 ACCK_CF_CLEARANCE，且未开启自动获取 cf_clearance', 'WARN');
        } else {
            accounts.push({
                jwt: singleJwt.trim(),
                cf: singleCf ? singleCf.trim() : '',
                remark: '默认账号'
            });
        }
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

async function fetchCfClearance(account, name) {
    try {
        const { chromium } = require('playwright-chromium');
        log(`【${name}】启动无头浏览器尝试获取新的 cf_clearance...`);
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: CONFIG.USER_AGENT,
            extraHTTPHeaders: { authorization: account.jwt }
        });
        const page = await context.newPage();
        await page.goto(`${CONFIG.BASE_URL}/api/users/getUserInfo`, { waitUntil: 'networkidle' });
        const cookies = await context.cookies(CONFIG.BASE_URL);
        await browser.close();

        const cfCookie = cookies.find(item => item.name === 'cf_clearance');
        if (cfCookie && cfCookie.value) {
            log(`【${name}】成功获取 cf_clearance`);
            return cfCookie.value;
        }

        log(`【${name}】未找到 cf_clearance，可能需要手动访问站点获取`, 'WARN');
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            log(`【${name}】缺少 playwright-chromium 依赖，请运行 npm install playwright-chromium playwright-core`, 'ERROR');
        } else {
            log(`【${name}】获取 cf_clearance 失败: ${error.message}`, 'ERROR');
        }
    }
    return null;
}

function isUnauthorized(status, data) {
    if (status === 401 || status === 403) return true;
    if (data && typeof data.code === 'number' && (data.code === 401 || data.code === 403)) return true;
    return false;
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
    let headers = buildHeaders(account);
    const tryRefreshCf = async () => {
        if (!CONFIG.AUTO_FETCH_CF) return false;
        const newCf = await fetchCfClearance(account, name);
        if (newCf) {
            account.cf = newCf;
            headers = buildHeaders(account);
            return true;
        }
        return false;
    };
    const result = {
        name,
        signed: false,
        success: false,
        points: null,
        message: ''
    };

    log(`开始处理【${name}】...`);

    if (CONFIG.AUTO_FETCH_CF && !account.cf) {
        const fetched = await tryRefreshCf();
        if (!fetched) {
            result.message = '缺少 cf_clearance，自动获取失败';
            return result;
        }
    }

    let statusRes = await request('/api/acLogs/signStatus', headers, name);
    if (!statusRes.success) {
        result.message = '签到状态检查失败';
        return result;
    }

    let statusData = statusRes.response.data;
    if (isUnauthorized(statusRes.response.status, statusData)) {
        if (await tryRefreshCf()) {
            statusRes = await request('/api/acLogs/signStatus', headers, name);
            if (!statusRes.success) {
                result.message = '签到状态检查失败';
                return result;
            }
            statusData = statusRes.response.data;
            if (isUnauthorized(statusRes.response.status, statusData)) {
                result.message = '凭证失效，需重新获取 authorization 与 cf_clearance';
                log(`【${name}】自动刷新 cf_clearance 后仍未授权，请更新 ACCK 环境变量`, 'WARN');
                return result;
            }
        } else {
            result.message = '凭证失效，需重新获取 authorization 与 cf_clearance';
            log(`【${name}】检测到凭证失效，请更新 ACCK 环境变量`, 'WARN');
            return result;
        }
    }
    const alreadySigned = statusData && statusData.data === true;

    let signBody = null;
    if (alreadySigned) {
        log(`【${name}】今日已签到，跳过签到步骤`);
        result.signed = true;
    } else {
        let signRes = await request('/api/acLogs/sign', headers, name);
        if (!signRes.success) {
            result.message = '签到接口请求失败';
            return result;
        }

        signBody = signRes.response.data;
        if (isUnauthorized(signRes.response.status, signBody)) {
            if (await tryRefreshCf()) {
                signRes = await request('/api/acLogs/sign', headers, name);
                if (!signRes.success) {
                    result.message = '签到接口请求失败';
                    return result;
                }
                signBody = signRes.response.data;
                if (isUnauthorized(signRes.response.status, signBody)) {
                    result.message = '签到失败: 凭证失效，请更新 authorization 与 cf_clearance';
                    log(`【${name}】签到请求自动刷新后仍未授权`, 'WARN');
                    return result;
                }
            } else {
                result.message = '签到失败: 凭证失效，请更新 authorization 与 cf_clearance';
                log(`【${name}】签到请求返回未授权，已停止后续流程`, 'WARN');
                return result;
            }
        }
        if (signBody && signBody.code === 200) {
            log(`【${name}】签到成功`);
            result.signed = true;
        } else {
            result.message = `签到失败: ${JSON.stringify(signBody)}`;
            return result;
        }
    }

    let infoRes = await request('/api/users/getUserInfo', headers, name);
    if (!infoRes.success) {
        result.message = '积分查询失败';
        return result;
    }

    let infoData = infoRes.response.data;
    if (isUnauthorized(infoRes.response.status, infoData)) {
        if (await tryRefreshCf()) {
            infoRes = await request('/api/users/getUserInfo', headers, name);
            if (!infoRes.success) {
                result.message = '积分查询失败';
                return result;
            }
            infoData = infoRes.response.data;
            if (isUnauthorized(infoRes.response.status, infoData)) {
                result.message = '积分查询失败: 凭证失效，请更新';
                log(`【${name}】积分查询自动刷新后仍未授权`, 'WARN');
                return result;
            }
        } else {
            result.message = '积分查询失败: 凭证失效，请更新';
            log(`【${name}】积分查询返回未授权，建议重新登录获取 Cookie`, 'WARN');
            return result;
        }
    }
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
