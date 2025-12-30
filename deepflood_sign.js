/**
 * DeepFlood 自动签到脚本
 * 网站: https://www.deepflood.com
 * * cron: 5 0 * * *
 * const $ = new Env('DeepFlood签到');
 * * 环境变量说明:
 * 1. DEEPFLOOD_COOKIE (必需)
 * - 网页登录后抓取 Cookie
 * 2. DEEPFLOOD_USER_AGENT (必需/推荐)
 * - 抓包时的浏览器 UA。务必设置，否则极易报 403。
 * 3. DEEPFLOOD_SIGN_TYPE (可选)
 * - fixed (默认) / random
 * * 作者: CodeBuddy
 * 更新时间: 2025-01-30 (修复 403 问题)
 */

const axios = require('axios');
const path = require('path');

// 尝试加载通知模块
let sendNotify;
try {
    sendNotify = require('./sendNotify.js').sendNotify;
} catch (error) {
    console.log('未找到 sendNotify.js，将使用 console.log 输出通知');
}

// 配置信息
const CONFIG = {
    URL_RANDOM: 'https://www.deepflood.com/api/attendance?random=true',
    URL_FIXED: 'https://www.deepflood.com/api/attendance?random=false',
    ORIGIN: 'https://www.deepflood.com',
    REFERER: 'https://www.deepflood.com/sw.js?v=0.3.33', 
    // 默认 UA (建议使用环境变量覆盖)
    DEFAULT_UA: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
    TIMEOUT: 20000,
    MAX_RETRY: 3
};

// 辅助函数：日志
function log(message) {
    const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    console.log(`[${time}] ${message}`);
}

// 辅助函数：延迟
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 获取账号列表
function getCookies() {
    const raw = process.env.DEEPFLOOD_COOKIE;
    if (!raw) return [];
    return raw.split(/[\n&]/).filter(item => !!item && item.trim().length > 0);
}

// 获取签到类型
function getSignType() {
    const type = process.env.DEEPFLOOD_SIGN_TYPE || 'fixed';
    return type.toLowerCase() === 'random' ? 'random' : 'fixed';
}

// 获取 User-Agent (优先使用环境变量)
function getUserAgent() {
    return process.env.DEEPFLOOD_USER_AGENT || CONFIG.DEFAULT_UA;
}

// 获取自定义 Headers
function getCustomHeaders() {
    const raw = process.env.DEEPFLOOD_HEADERS;
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch (e) {
        log('❌ 自定义 DEEPFLOOD_HEADERS JSON 格式错误，已忽略');
        return {};
    }
}

// 执行签到
async function sign(cookie, index, customHeaders) {
    const logPrefix = `账号${index + 1}`;
    const signType = getSignType();
    const ua = getUserAgent();
    const targetUrl = signType === 'random' ? CONFIG.URL_RANDOM : CONFIG.URL_FIXED;
    const typeName = signType === 'random' ? '随机鸡腿' : '固定签到';
    
    // 构造高度拟真的浏览器 Headers
    const headers = {
        'User-Agent': ua,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // 关键字段：防止403
        'Origin': CONFIG.ORIGIN,
        'Referer': CONFIG.REFERER,
        'Cookie': cookie,
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Priority': 'u=1, i',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'refract-version': '0.3.33', 
        ...customHeaders 
    };
    
    let retryCount = 0;
    while (retryCount < CONFIG.MAX_RETRY) {
        try {
            log(`⏳ [${logPrefix}] 开始第 ${retryCount + 1} 次尝试签到 (${typeName})...`);
            
            const axiosConfig = {
                headers: headers,
                timeout: CONFIG.TIMEOUT,
            };

            const response = await axios.post(targetUrl, {}, axiosConfig);
            const data = response.data;
            
            if (data && (data.success === true || data.message)) {
                const msg = data.message || '签到成功';
                const gain = data.gain ? `获得 ${data.gain}` : '';
                const current = data.current ? `当前 ${data.current}` : '';
                
                log(`✅ [${logPrefix}] 签到成功: ${msg}`);
                return {
                    success: true,
                    msg: `🎉 ${msg}\n💰 ${gain}\nlz ${current}`
                };
            } else {
                const msg = data.message || '未知错误';
                if (msg.includes('已经签到') || msg.includes('Have attended') || msg.includes('重复操作')) {
                     log(`🔵 [${logPrefix}] 今日已签到: ${msg}`);
                     return { success: true, msg: `👌 ${msg}` };
                }

                log(`❌ [${logPrefix}] 签到失败: ${JSON.stringify(data)}`);
                return {
                    success: false,
                    msg: `❌ 失败: ${msg}`
                };
            }

        } catch (error) {
            // 特判：HTTP 500 可能表示已签到
            if (error.response && error.response.status === 500) {
                 const data = error.response.data || {};
                 const msg = data.message || '';
                 if (msg.includes('已完成签到') || msg.includes('重复操作') || msg.includes('Have attended')) {
                     log(`🔵 [${logPrefix}] 今日已签到 (HTTP 500): ${msg}`);
                     return { success: true, msg: `👌 ${msg}` };
                 }
            }

            // 处理 403 Cloudflare 拦截
            if (error.response && error.response.status === 403) {
                log(`⚠️ [${logPrefix}] 遭遇 HTTP 403 拦截`);
                log(`💡 常见原因: 1. Cookie绑定的IP与当前服务器IP不一致 2. UA不匹配`);
                return {
                    success: false,
                    msg: `❌ Cloudflare 盾拦截 (403)，请检查 UA 或更新 Cookie`
                };
            }

            const errorMsg = error.response ? 
                `HTTP ${error.response.status} - ${JSON.stringify(error.response.data).substring(0, 100)}...` : 
                error.message;
            
            log(`⚠️ [${logPrefix}] 请求异常: ${errorMsg}`);
            
            if (error.response && (error.response.status === 401)) {
                return {
                    success: false,
                    msg: `❌ Cookie 已失效 (401)，请重新提取`
                };
            }

            retryCount++;
            await delay(2000);
        }
    }

    return {
        success: false,
        msg: `❌ 超过最大重试次数，网络或接口异常`
    };
}

// 主函数
async function main() {
    log('🚀 DeepFlood 自动签到脚本开始执行');
    
    const cookies = getCookies();
    const customHeaders = getCustomHeaders();
    const signType = getSignType();

    if (cookies.length === 0) {
        log('❌ 未找到环境变量 DEEPFLOOD_COOKIE，请先配置。');
        return;
    }

    log(`📝 检测到 ${cookies.length} 个账号`);
    const typeDisplay = signType === 'random' ? '随机鸡腿' : '固定签到 (默认)';
    log(`🎯 签到模式: ${typeDisplay}`);
    log(`🛡️ User-Agent: ${getUserAgent().substring(0, 50)}...`);

    if (Object.keys(customHeaders).length > 0) {
        log(`🔧 检测到自定义 Headers 配置`);
    }

    const results = [];
    
    for (let i = 0; i < cookies.length; i++) {
        const result = await sign(cookies[i], i, customHeaders);
        results.push(result);
        if (i < cookies.length - 1) {
            const waitTime = Math.floor(Math.random() * 3000) + 2000;
            await delay(waitTime);
        }
    }

    const successCount = results.filter(r => r.success).length;
    const notifyTitle = `DeepFlood 签到: 成功 ${successCount}/${results.length}`;
    let notifyContent = `执行时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`;
    notifyContent += `模式: ${typeDisplay}\n\n`;
    
    results.forEach((res, index) => {
        notifyContent += `账号 ${index + 1}:\n${res.msg}\n\n`;
    });

    log('📋 最终结果汇总:');
    console.log(notifyContent);

    if (sendNotify) {
        await sendNotify(notifyTitle, notifyContent);
    }
}

if (require.main === module) {
    main().catch(e => {
        console.error('脚本运行时发生未捕获错误:', e);
    });
}
