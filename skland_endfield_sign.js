/**
 * 森空岛 - 明日方舟：终末地签到脚本
 *
 * cron: 30 0 * * *
 * const $ = new Env('终末地签到');
 *
 * 环境变量说明:
 * 1. SKLAND_ENDFIELD_ACCOUNTS (推荐)
 *    - 支持多账号，使用换行或 & 分隔
 *    - 单个账号格式:
 *      CRED#DID#ROLE#USER_AGENT#VNAME#PLATFORM#SIGN_SALT#SIGN#备注
 *    - 备注可选
 *
 * 1.1 兼容简化配置
 *    - SKLAND_ENDFIELD_LIST: cred#role#备注 (多账号用换行或 & 分隔)
 *
 * 2. 单账号简写
 *    - SKLAND_CRED: 抓包请求头中的 cred
 *    - SKLAND_DID: 抓包请求头中的 did
 *    - SKLAND_ROLE: 抓包请求头中的 sk-game-role
 *    - SKLAND_USER_AGENT: 抓包请求头中的 user-agent (可选)
 *    - SKLAND_VNAME: 抓包请求头中的 vname (默认 1.0.0)
 *    - SKLAND_PLATFORM: 抓包请求头中的 platform (默认 3)
 *    - SKLAND_SIGN_SALT: 签名用 Salt (可选，默认脚本内置)
 *    - SKLAND_SIGN: 抓包请求头中的 sign (可选，若提供则优先使用)
 *    - SKLAND_TIMESTAMP: 抓包请求头中的 timestamp (可选，默认使用当前时间戳)
 *
 * 注意:
 * - sign 可使用抓包值，或由 path + body + timestamp + salt 计算，若签名校验失败请更新 salt 或重新抓包。
 * - 每月签到奖励可能变化，脚本会根据接口返回动态展示奖励内容。
 *
 * 依赖: npm install axios
 */

const axios = require('axios');
const crypto = require('crypto');

let sendNotify;
try {
    sendNotify = require('./sendNotify.js').sendNotify;
} catch (error) {
    console.log('未找到 sendNotify.js，将使用 console.log 输出通知');
}

const CONFIG = {
    BASE_URL: 'https://zonai.skland.com',
    ENDPOINT: '/web/v1/game/endfield/attendance',
    TIMEOUT: 15000,
    SIGN_SALT: process.env.SKLAND_SIGN_SALT || 'c2594619f518e388fcc24a806020c78a',
    DEFAULT_UA: 'Mozilla/5.0 (Linux; Android 16; 23078RKD5C Build/BP2A.250605.031.A3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.59 Mobile Safari/537.36; SKLand/1.52.1',
    DEFAULT_VNAME: '1.0.0',
    DEFAULT_PLATFORM: '3'
};

function log(message, level = 'INFO') {
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    console.log(`[${timestamp}] [${level}] ${message}`);
}

function parseAccounts() {
    const accounts = [];
    const raw = process.env.SKLAND_ENDFIELD_ACCOUNTS;

    if (raw) {
        const entries = raw.split(/[\n&]/).map(item => item.trim()).filter(Boolean);
        entries.forEach((entry, index) => {
            const parts = entry.split('#').map(part => part.trim());
            const [cred, did, role, userAgent, vname, platform, signSalt, sign, remark] = parts;
            if (!cred || !did || !role) {
                log(`账号配置第 ${index + 1} 条格式不完整，需包含 cred/did/role`, 'WARN');
                return;
            }
            accounts.push({
                cred,
                did,
                role,
                userAgent: userAgent || CONFIG.DEFAULT_UA,
                vname: vname || CONFIG.DEFAULT_VNAME,
                platform: platform || CONFIG.DEFAULT_PLATFORM,
                signSalt: signSalt || CONFIG.SIGN_SALT,
                sign: sign || '',
                timestamp: process.env.SKLAND_TIMESTAMP || '',
                remark: remark || `账号${accounts.length + 1}`
            });
        });
    }

    if (accounts.length === 0 && process.env.SKLAND_ENDFIELD_LIST) {
        const entries = process.env.SKLAND_ENDFIELD_LIST
            .split(/[\n&]/)
            .map(item => item.trim())
            .filter(Boolean);
        entries.forEach((entry, index) => {
            const parts = entry.split('#').map(part => part.trim());
            const [cred, role, remark] = parts;
            if (!cred || !role) {
                log(`简化账号配置第 ${index + 1} 条格式不完整，需包含 cred/role`, 'WARN');
                return;
            }
            accounts.push({
                cred,
                did: process.env.SKLAND_DID || '',
                role,
                userAgent: process.env.SKLAND_USER_AGENT || CONFIG.DEFAULT_UA,
                vname: process.env.SKLAND_VNAME || CONFIG.DEFAULT_VNAME,
                platform: process.env.SKLAND_PLATFORM || CONFIG.DEFAULT_PLATFORM,
                signSalt: process.env.SKLAND_SIGN_SALT || CONFIG.SIGN_SALT,
                sign: process.env.SKLAND_SIGN || '',
                timestamp: process.env.SKLAND_TIMESTAMP || '',
                remark: remark || `账号${accounts.length + 1}`
            });
        });
    }

    if (accounts.length === 0 && process.env.SKLAND_CRED) {
        const cred = process.env.SKLAND_CRED;
        const did = process.env.SKLAND_DID;
        const role = process.env.SKLAND_ROLE;
        if (!did || !role) {
            log('单账号配置缺少 SKLAND_DID/SKLAND_ROLE', 'WARN');
        } else {
            accounts.push({
                cred,
                did,
                role,
                userAgent: process.env.SKLAND_USER_AGENT || CONFIG.DEFAULT_UA,
                vname: process.env.SKLAND_VNAME || CONFIG.DEFAULT_VNAME,
                platform: process.env.SKLAND_PLATFORM || CONFIG.DEFAULT_PLATFORM,
                signSalt: process.env.SKLAND_SIGN_SALT || CONFIG.SIGN_SALT,
                sign: process.env.SKLAND_SIGN || '',
                timestamp: process.env.SKLAND_TIMESTAMP || '',
                remark: process.env.SKLAND_REMARK || '默认账号'
            });
        }
    }

    return accounts;
}

function getTimestamp(account) {
    if (account.timestamp) return String(account.timestamp).trim();
    return Math.floor(Date.now() / 1000).toString();
}

function generateSign(path, body, timestamp, salt) {
    const payload = `${path}${body}${timestamp}${salt}`;
    return crypto.createHash('md5').update(payload).digest('hex');
}

function buildHeaders(account, method) {
    const timestamp = getTimestamp(account);
    const body = method === 'POST' ? '' : '';
    const sign = account.sign || generateSign(CONFIG.ENDPOINT, body, timestamp, account.signSalt || CONFIG.SIGN_SALT);
    return {
        cred: account.cred,
        sign,
        did: account.did,
        'sk-game-role': account.role,
        timestamp,
        vname: account.vname,
        platform: account.platform,
        'user-agent': account.userAgent,
        'content-type': 'application/json',
        accept: '*/*',
        origin: 'https://game.skland.com',
        referer: 'https://game.skland.com/',
        'x-requested-with': 'com.hypergryph.skland'
    };
}

async function request(method, headers) {
    try {
        const response = await axios({
            method,
            url: `${CONFIG.BASE_URL}${CONFIG.ENDPOINT}`,
            headers,
            data: method === 'POST' ? '' : undefined,
            timeout: CONFIG.TIMEOUT,
            validateStatus: status => status >= 200 && status < 500
        });
        return { success: true, response };
    } catch (error) {
        return { success: false, error };
    }
}

function formatAwards(awardIds, resourceMap) {
    if (!Array.isArray(awardIds) || awardIds.length === 0) return [];
    return awardIds.map(item => {
        const id = item.id || item.awardId;
        const info = resourceMap ? resourceMap[id] : null;
        if (info) {
            return `${info.name} x${info.count}`;
        }
        return id || '未知奖励';
    });
}

function getLastDoneAward(calendar) {
    if (!Array.isArray(calendar)) return null;
    const doneItems = calendar.filter(item => item.done);
    if (doneItems.length === 0) return null;
    return doneItems[doneItems.length - 1].awardId;
}

async function handleAccount(account, index) {
    const name = account.remark || `账号${index + 1}`;
    const result = {
        name,
        success: false,
        signed: false,
        message: '',
        awards: [],
        tomorrowAwards: [],
        timestamp: ''
    };

    log(`开始处理【${name}】...`);

    const statusHeaders = buildHeaders(account, 'GET');
    result.timestamp = statusHeaders.timestamp;
    const statusRes = await request('GET', statusHeaders);
    if (!statusRes.success) {
        result.message = `查询状态失败: ${statusRes.error.message}`;
        return result;
    }

    const statusData = statusRes.response.data;
    if (!statusData || statusData.code !== 0) {
        result.message = `查询状态失败: ${statusData ? statusData.message : '未知错误'}`;
        return result;
    }

    const resourceMap = statusData.data ? statusData.data.resourceInfoMap : {};
    const calendar = statusData.data ? statusData.data.calendar : [];
    const lastDoneAwardId = getLastDoneAward(calendar);

    const signHeaders = buildHeaders(account, 'POST');
    const signRes = await request('POST', signHeaders);
    if (!signRes.success) {
        result.message = `签到请求失败: ${signRes.error.message}`;
        return result;
    }

    const signData = signRes.response.data;
    if (signData && signData.code === 0) {
        result.success = true;
        result.signed = true;
        result.message = '签到成功';
        const awardIds = signData.data ? signData.data.awardIds : [];
        const signResourceMap = signData.data ? signData.data.resourceInfoMap : resourceMap;
        result.awards = formatAwards(awardIds, signResourceMap);
        result.tomorrowAwards = formatAwards(signData.data ? signData.data.tomorrowAwardIds : [], signResourceMap);
        const awardText = result.awards.length > 0 ? result.awards.join('、') : '无';
        const tomorrowText = result.tomorrowAwards.length > 0 ? result.tomorrowAwards.join('、') : '未知';
        log(`【${name}】签到成功，今日奖励: ${awardText}；明日奖励: ${tomorrowText}`);
        return result;
    }

    const signMessage = signData && signData.message ? signData.message : '未知错误';
    if (/已|already|repeat/i.test(signMessage)) {
        result.success = true;
        result.signed = true;
        result.message = '今日已签到';
        if (lastDoneAwardId) {
            result.awards = formatAwards([{ awardId: lastDoneAwardId }], resourceMap);
        }
        const awardText = result.awards.length > 0 ? result.awards.join('、') : '无';
        log(`【${name}】今日已签到，最近奖励: ${awardText}`);
        return result;
    }

    result.message = `签到失败: ${signMessage}`;
    log(`【${name}】签到失败: ${signMessage}`, 'WARN');
    return result;
}

function buildNotifyContent(results) {
    let content = '🎯 终末地签到报告\n';
    content += `${'='.repeat(28)}\n`;

    results.forEach((res, idx) => {
        const status = res.success ? '✅' : '❌';
        content += `\n${idx + 1}. ${status} ${res.name}\n`;
        content += `   状态: ${res.message}\n`;
        if (res.timestamp) {
            content += `   请求时间: ${res.timestamp}\n`;
        }
        if (res.awards.length > 0) {
            content += `   今日奖励: ${res.awards.join('、')}\n`;
        } else {
            content += `   今日奖励: 无\n`;
        }
        if (res.tomorrowAwards.length > 0) {
            content += `   明日奖励: ${res.tomorrowAwards.join('、')}\n`;
        }
    });

    content += `\n${'='.repeat(28)}\n`;
    content += `🕐 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
    return content;
}

async function main() {
    const startTime = Date.now();
    log(`开始执行终末地签到 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    const accounts = parseAccounts();
    if (accounts.length === 0) {
        log('未找到有效的终末地账号配置，请检查环境变量', 'ERROR');
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
    log('签到结果汇总:');
    results.forEach(item => {
        const awardText = item.awards.length > 0 ? item.awards.join('、') : '无';
        const tomorrowText = item.tomorrowAwards.length > 0 ? item.tomorrowAwards.join('、') : '未知';
        log(`- ${item.name}: ${item.message} | 今日奖励: ${awardText} | 明日奖励: ${tomorrowText}`);
    });

    const notifyContent = buildNotifyContent(results);
    if (sendNotify) {
        try {
            await sendNotify('终末地签到结果', notifyContent);
        } catch (error) {
            log(`发送通知失败: ${error.message}`, 'ERROR');
        }
    } else {
        console.log(notifyContent);
    }
    const endTime = Date.now();
    const durationSeconds = Math.max(1, Math.round((endTime - startTime) / 1000));
    log(`执行结束 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}  耗时 ${durationSeconds} 秒`);
}

if (require.main === module) {
    main().catch(error => {
        log(`脚本执行异常: ${error.message}`, 'ERROR');
        process.exit(1);
    });
}

module.exports = { main };
