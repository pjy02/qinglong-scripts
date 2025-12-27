/**
 * NodeSeek 自动签到脚本
 * 网站: https://www.nodeseek.com
 * * cron: 10 0 * * *
 * const $ = new Env('NodeSeek签到');
 * * 环境变量说明:
 * 1. NODESEEK_COOKIE (必需)
 * - 网页登录后抓取 Cookie，多个账号用换行或 & 分隔
 * * 2. NODESEEK_SIGN_TYPE (可选)
 * - random: 随机签到 (默认，推荐)
 * - fixed: 固定签到
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
    URL_RANDOM: 'https://www.nodeseek.com/api/attendance?random=true',
    URL_FIXED: 'https://www.nodeseek.com/api/attendance',
    ORIGIN: 'https://www.nodeseek.com',
    REFERER: 'https://www.nodeseek.com/board', 
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
    const raw = process.env.NODESEEK_COOKIE;
    if (!raw) return [];
    return raw.split(/[\n&]/).filter(item => !!item && item.trim().length > 0);
}

// 获取签到类型
function getSignType() {
    const type = process.env.NODESEEK_SIGN_TYPE || 'random';
    return type.toLowerCase() === 'fixed' ? 'fixed' : 'random';
}

// 执行签到
async function sign(cookie, index) {
    const logPrefix = `账号${index + 1}`;
    const signType = getSignType();
    const targetUrl = signType === 'random' ? CONFIG.URL_RANDOM : CONFIG.URL_FIXED;
    // 统一日志文案
    const typeName = signType === 'random' ? '随机鸡腿' : '固定签到';

    const headers = {
        'User-Agent': CONFIG.USER_AGENT,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': CONFIG.ORIGIN,
        'Referer': CONFIG.REFERER,
        'Cookie': cookie,
        'Accept': 'application/json, text/javascript, */*; q=0.01'
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
            
            if (data.success === true) {
                const msg = data.message || '签到成功';
                const gain = data.gain ? `获得 ${data.gain}` : '';
                
                log(`✅ [${logPrefix}] 签到成功: ${msg}`);
                return {
                    success: true,
                    msg: `🎉 ${msg} ${gain}`
                };
            } else {
                const msg = data.message || '未知错误';
                if (msg.includes('已经签到') || msg.includes('Have attended')) {
                    log(`🔵 [${logPrefix}] 今日已签到: ${msg}`);
                    return {
                        success: true,
                        msg: `👌 ${msg}`
                    };
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
    log('🚀 NodeSeek 自动签到脚本开始执行');
    
    const cookies = getCookies();
    const signType = getSignType();

    if (cookies.length === 0) {
        log('❌ 未找到环境变量 NODESEEK_COOKIE，请先配置。');
        return;
    }

    log(`📝 检测到 ${cookies.length} 个账号`);
    // 统一日志格式：显示推荐状态
    const typeDisplay = signType === 'random' ? '随机鸡腿 (推荐)' : '固定签到';
    log(`🎯 签到模式: ${typeDisplay}`);

    const results = [];
    
    for (let i = 0; i < cookies.length; i++) {
        const result = await sign(cookies[i], i);
        results.push(result);
        if (i < cookies.length - 1) {
            await delay(3000);
        }
    }

    const successCount = results.filter(r => r.success).length;
    const notifyTitle = `NodeSeek 签到: 成功 ${successCount}/${results.length}`;
    let notifyContent = `执行时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`;
    notifyContent += `模式: ${typeDisplay}\n\n`;
    
    results.forEach((res, index) => {
        notifyContent += `账号 ${index + 1}: ${res.msg}\n`;
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