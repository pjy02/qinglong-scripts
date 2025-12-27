/**
 * DeepFlood 自动签到脚本
 * 网站: https://www.deepflood.com
 * * cron: 5 0 * * *
 * const $ = new Env('DeepFlood签到');
 * * 环境变量说明:
 * 1. DEEPFLOOD_COOKIE (必需)
 * - 网页登录后抓取 Cookie，多个账号用换行或 & 分隔
 * * 2. DEEPFLOOD_SIGN_TYPE (可选)
 * - fixed: 固定签到 (默认，奖励稳定)
 * - random: 随机签到 (奖励波动，可能获得更多)
 * * 3. DEEPFLOOD_HEADERS (可选)
 * - 自定义 Headers JSON 字符串，用于解决签名校验问题
 * * 作者: CodeBuddy
 * 更新时间: 2025-01-27
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
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
    TIMEOUT: 15000,
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
    // 支持换行和&分隔
    return raw.split(/[\n&]/).filter(item => !!item && item.trim().length > 0);
}

// 获取签到类型
function getSignType() {
    // 默认为 fixed
    const type = process.env.DEEPFLOOD_SIGN_TYPE || 'fixed';
    // 只有明确设置为 random 时才启用随机模式，否则一律固定模式
    return type.toLowerCase() === 'random' ? 'random' : 'fixed';
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
    const targetUrl = signType === 'random' ? CONFIG.URL_RANDOM : CONFIG.URL_FIXED;
    const typeName = signType === 'random' ? '随机模式' : '固定模式';
    
    // 构造 Headers
    const headers = {
        'User-Agent': CONFIG.USER_AGENT,
        'Content-Type': 'application/json',
        'Origin': CONFIG.ORIGIN,
        'Referer': CONFIG.REFERER,
        'Cookie': cookie,
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'refract-version': '0.3.33',
        ...customHeaders 
    };
    
    let retryCount = 0;
    while (retryCount < CONFIG.MAX_RETRY) {
        try {
            log(`⏳ [${logPrefix}] 开始第 ${retryCount + 1} 次尝试签到 (${typeName})...`);
            
            const response = await axios.post(targetUrl, {}, {
                headers: headers,
                timeout: CONFIG.TIMEOUT
            });

            const data = response.data;
            
            // 响应示例: {"success":true,"message":"今天的签到收益是5个鸡腿","gain":5,"current":655}
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
                // 检查是否已签到
                // {"success": false, "message": "已经签到过了"} 
                const msg = data.message || '未知错误';
                if (msg.includes('已经签到') || msg.includes('Have attended')) {
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
            const errorMsg = error.response ? 
                `HTTP ${error.response.status} - ${JSON.stringify(error.response.data)}` : 
                error.message;
            
            log(`⚠️ [${logPrefix}] 请求异常: ${errorMsg}`);
            
            if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                return {
                    success: false,
                    msg: `❌ Cookie 已失效，请重新提取`
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
    log(`🎯 签到模式: ${signType === 'random' ? '随机模式' : '固定模式 (默认)'}`);

    if (Object.keys(customHeaders).length > 0) {
        log(`🔧 检测到自定义 Headers 配置，将覆盖默认设置`);
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

    // 汇总通知
    const successCount = results.filter(r => r.success).length;
    const notifyTitle = `DeepFlood 签到: 成功 ${successCount}/${results.length}`;
    let notifyContent = `执行时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`;
    notifyContent += `模式: ${signType}\n\n`;
    
    results.forEach((res, index) => {
        notifyContent += `账号 ${index + 1}:\n${res.msg}\n\n`;
    });

    log('📋 最终结果汇总:');
    console.log(notifyContent);

    if (sendNotify) {
        await sendNotify(notifyTitle, notifyContent);
    }
}

// 执行
if (require.main === module) {
    main().catch(e => {
        console.error('脚本运行时发生未捕获错误:', e);
    });
}