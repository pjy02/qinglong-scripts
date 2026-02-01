/**
 * 森空岛-明日方舟：终末地 自动签到脚本
 * * cron: 30 7 * * *
 * const $ = new Env('终末地签到2');
 * * ⚠️ 【重要说明】
 * 终末地签到需要抓取 header 中的 cred 和 sk-game-role。
 * 建议使用手机抓包工具（如 HttpCanary, Charles, Fiddler）抓取森空岛 APP。
 * * * ⚙️ 环境变量配置:
 * 1. SKLAND_ENDFIELD_LIST
 * - 格式：cred#role_id#备注
 * - 多账号用换行或 & 分隔
 * - 示例：
 * hnMAO0po...#3_1033204557_1#我的大号
 * another_cred...#3_12345678_1#我的小号
 * * * 参数获取方法：
 * - cred: 请求头中的 cred 字段 (抓包获取)
 * - role_id: 请求头中的 sk-game-role 字段 (抓包获取)
 * * * 依赖: npm install axios crypto
 */

const axios = require('axios');
const crypto = require('crypto');
const { sendNotify } = require('./sendNotify.js');

// 配置信息
const CONFIG = {
    // 您抓包提供的接口地址
    API_URL: 'https://zonai.skland.com/web/v1/game/endfield/attendance',
    // 森空岛 Android 客户端通用 Salt，用于计算 sign，这是自动化的关键
    SIGN_SALT: 'c2594619f518e388fcc24a806020c78a', 
    TIMEOUT: 15000,
    // 使用您抓包中的较新 UA
    USER_AGENT: 'Mozilla/5.0 (Linux; Android 16; 23078RKD5C Build/BP2A.250605.031.A3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.59 Mobile Safari/537.36; SKLand/1.52.1'
};

// 日志函数
function log(message) {
    const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    console.log(`[${time}] ${message}`);
}

// 延迟函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 计算签名 (核心自动化逻辑)
function generateSignature(path, body, timestamp) {
    // 算法: md5(path + body + timestamp + salt)
    // body 为空时视为空字符串
    const str = path + body + CONFIG.SIGN_SALT;
    const sign = crypto.createHash('md5').update(str).digest('hex');
    return sign;
}

// 解析账号配置
function getAccounts() {
    const raw = process.env.SKLAND_ENDFIELD_LIST;
    if (!raw) return [];
    
    return raw.split(/[\n&]/)
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .map(item => {
            const parts = item.split('#');
            return {
                cred: parts[0],
                roleId: parts[1],
                remark: parts[2] || '默认账号'
            };
        });
}

// 执行签到
async function doSign(account, index) {
    const { cred, roleId, remark } = account;
    const logPrefix = `[${remark}]`;
    
    log(`${logPrefix} 开始执行终末地签到...`);
    
    // 1. 准备动态参数 (自动生成当前时间戳和签名)
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const path = '/web/v1/game/endfield/attendance';
    const sign = generateSignature(path, '', timestamp); 
    
    // 2. 构造 Headers (基于您的抓包精简必要字段)
    const headers = {
        'host': 'zonai.skland.com',
        'cred': cred,
        'sk-game-role': roleId,
        'sign': sign,
        'timestamp': timestamp,
        'vname': '1.0.0',
        'platform': '3',
        'dId': 'Ba4P+Ru8JocG5TEnThGj5qD0lzHc4EWHZY43BBbj+It6gmLZN58lBnCs/ggIuPjS2FyH7FitQkGIH0G2PkC/o/A==', // 固定 DeviceID 即可
        'user-agent': CONFIG.USER_AGENT,
        'content-type': 'application/json',
        'origin': 'https://game.skland.com',
        'referer': 'https://game.skland.com/'
    };

    try {
        // 3. 发送 POST 请求
        const response = await axios.post(CONFIG.API_URL, {}, {
            headers: headers,
            timeout: CONFIG.TIMEOUT
        });

        const resData = response.data;
        
        // 4. 处理结果 (适配抓包返回结构)
        if (resData.code === 0) {
            const data = resData.data;
            let msg = '';

            // 情况A: 签到成功 (data.awardIds 存在且有内容)
            if (data.awardIds && data.awardIds.length > 0) {
                const award = data.awardIds[0]; 
                // 从 resourceInfoMap 中查找道具名称
                const resourceInfo = data.resourceInfoMap && data.resourceInfoMap[award.id];
                
                const itemName = resourceInfo ? resourceInfo.name : award.id;
                const itemCount = resourceInfo ? resourceInfo.count : (award.count || 1);
                
                msg = `✅ 签到成功! 获得: ${itemName} x${itemCount}`;
                log(`${logPrefix} ${msg}`);
                return { success: true, msg };
            } 
            // 情况B: 今日已签到 (通常没有 awardIds，或需检查 calendar)
            else {
                // 检查 calendar 确认是否真的已签到
                // 根据您的抓包2，calendar 里的 done=true 表示已完成
                msg = `🔵 今日已签到 (无新奖励)`;
                log(`${logPrefix} ${msg}`);
                return { success: true, msg };
            }
        } else {
            // 情况C: 业务错误
            log(`${logPrefix} ❌ 签到失败: code=${resData.code}, message=${resData.message}`);
            return {
                success: false,
                msg: `❌ 错误: ${resData.message}`
            };
        }

    } catch (error) {
        // 情况D: 网络或 HTTP 错误
        const errMsg = error.response ? 
            `HTTP ${error.response.status} - ${JSON.stringify(error.response.data)}` : 
            error.message;
            
        log(`${logPrefix} ⚠️ 请求异常: ${errMsg}`);
        return {
            success: false,
            msg: `⚠️ 异常: ${error.message}`
        };
    }
}

// 主函数
async function main() {
    log('🚀 森空岛-终末地 签到脚本启动');
    
    const accounts = getAccounts();
    if (accounts.length === 0) {
        log('❌ 未配置环境变量 SKLAND_ENDFIELD_LIST');
        log('💡 格式: cred#role_id#备注');
        return;
    }
    
    log(`📝 检测到 ${accounts.length} 个账号`);
    
    const results = [];
    for (let i = 0; i < accounts.length; i++) {
        const res = await doSign(accounts[i], i);
        results.push({
            name: accounts[i].remark,
            ...res
        });
        if (i < accounts.length - 1) await delay(3000); 
    }
    
    // 汇总通知
    const successCount = results.filter(r => r.success).length;
    const title = `终末地签到: 成功 ${successCount}/${results.length}`;
    let content = `执行时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n`;
    
    results.forEach(res => {
        content += `${res.name}: ${res.msg}\n`;
    });
    
    if (typeof sendNotify === 'function') {
        await sendNotify(title, content);
    } else {
        console.log(`\n=== 通知推送 ===\n${title}\n${content}`);
    }
}

main().catch(e => console.error(e));

