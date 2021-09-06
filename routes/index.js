var express = require('express');
var FS = require('fs');
var X2JS = require("x2js")
const { exec } = require('child_process');
const NETCONF = require('./net_interface.js');
const VPN_CLIENT = require('./vpnCertClient');
const INI = require('ini');
const { getHeapSnapshot } = require('v8');
const { parse } = require('path');
const { json } = require('body-parser');
const { SSL_OP_NO_TLSv1_2, POINT_CONVERSION_COMPRESSED } = require('constants');
const { encode } = require('querystring');

var DEV_NAME = "";
var DEV_SN = "";

var router = express.Router();

/**
 * @brief 初始化设备ID
 */
function initDevID() {
        let _data1 = FS.readFileSync('./etc/config.json');
        let json = JSON.parse(_data1)
        let path = json.vendor
        let ini_data = FS.readFileSync(path, { encoding: "UTF8" });
        let ini = INI.parse(ini_data);
        DEV_SN = ini.device.devsn;
        DEV_NAME = DEV_SN.substr(0, 6);
        if (DEV_NAME.substr(0, 3) == "100") {
                DEV_NAME = DEV_NAME.replace(/100/, "ISG")
        }
}
/**
 * @brief 采用promise异步执行命令。
 * @param cmd {I} ， 要执行的系统命令
 */
function __exec_cmd(cmd) {
        return new Promise((res) => {
                exec(cmd, { cwd: "/root/httpSvr", shell: "/bin/bash" }, (err, stdout, stderr) => {
                        if (err) {
                                console.log(stderr);
                                res(false);
                        }

                        res(true)
                });
        })
}



/* GET home page. */
router.get('/', function (req, res, next) {
        res.render('index', { title: 'Express' });
});
/**
 * @brief 获取设备名称
 */
function getDevName() {
        return DEV_NAME;
}

router.post("/api/devName", (req, res) => { // 获取设备名称
        let cmd = req.body.CMD;
        if (cmd == "DEV_NAME") {
                let data = {
                        CMD: cmd,
                        name: getDevName()
                };
                res.send(JSON.stringify(data));
        } else {
                res.send("Unknow Device Type.");
                console.log("操作命令不支持");
        }
})
/**
 * @brief 修改配置文件中的用户密码
 */
function modifyConfigFile() {
        let data = FS.readFileSync("./etc/config.json");
        let json = JSON.parse(data);
        json.password = global.userPswd;
        data = JSON.stringify(json);
        let rst = FS.writeFileSync("./etc/config.json", data);

        return true;
}

router.post("/api/account", (req, res) => {
        let json = {};
        let rst_data = {
                STATUS: "SUCCESS",
                CMD: req.body.CMD
        }
        let user = '';
        json = req.body;


        if (req.body.user)
                user = req.body.user.toUpperCase();

        let pswd = global.userPswd
        switch (json.CMD) {
                case 'LOGIN': { // 登入系统
                        if (user != 'ADMIN') {
                                rst_data.STATUS = 'ACCOUNT_FAIL';
                        } else if (json.pswd != pswd) {
                                rst_data.STATUS = 'PSWD_FAIL';
                        } else {
                                req.session.userinfo = 'admin';
                        }
                        res.send(JSON.stringify(rst_data));
                }
                        break;
                case 'LOGOUT': // 登出系统
                        req.session.userinfo = null;
                        res.send(JSON.stringify());
                        break;
                case 'IS_LOGIN':// 判断是否登录
                        if (!req.session.userinfo) {
                                rst_data.STATUS = 'NOT_LOGIN'
                        }
                        res.send(JSON.stringify(rst_data))
                        break;
                case 'MODIFY_PSWD':// 修改
                        global.userPswd = req.body.pswd;
                        if (modifyConfigFile() == false) {
                                rst_data.STATUS = 'SAVE_PSWD_FAIL';
                        }
                        res.send(JSON.stringify(rst_data));
                        break;
        }
})
/**
 * 修改WIFI配置文件
 * @param { I } param  
 * @param { I } cb
 */
function saveWifi(param, cb) {
        const wpaConf = require('./wpaConf.js')

        let confFile = new wpaConf();

        if (cb && typeof (cb) == 'function') {
                confFile.setValue("network.ssid", param.ssid);
                confFile.setValue("network.psk", param.psk);
                confFile.setValue("network.pairwise", param.pairwise);
                confFile.setValue("network.key_mgmt", param.key_mgmt);
                if (confFile.save() == true)
                        cb({ STATUS: 'SUCCESS' });
                else cb({ STATUS: 'FAIL' });
        }
}
/**
 * 保存网络配置参数
 * @param {I} netConf 
 */
function doSaveNet(netConf) {
        let conf_file = new NETCONF();
        for (let i = 0; i < 2; i++) {
                conf_file.__m_data.eth[i].address = "";
                conf_file.__m_data.eth[i].mask = "";
                conf_file.__m_data.eth[i].gateway = "";
        }

        let ret = {
                STATUS: "SUCCESS"
        }

        // 转换数据
        let iface = "", type = "";
        for (let i in netConf.data) {
                iface = netConf.data[i].interface;
                type = netConf.data[i].type;
                conf_file.setIfaceType(iface, type);
                if (type == 'static') { // 对于静态IP的要进行处理静态地址内容
                        conf_file.setInterface(iface, "address", netConf.data[i].ip);
                        conf_file.setInterface(iface, "mask", netConf.data[i].mask);
                        conf_file.setInterface(iface, "gateway", netConf.data[i].gate);
                } else {
                        conf_file.setInterface(iface, "address", "");
                        conf_file.setInterface(iface, "mask", "");
                        conf_file.setInterface(iface, "gateway", "");
                }
        }

        // 保存数据
        ret = conf_file.save();

        return ret;
}
/**
 * 安装VPN证书
 * @param {I} cmd 
 */
function installVpnCert(cmd, cb) {
        if (cb && typeof (cb) == 'function') {
                let vpn = new VPN_CLIENT(cmd.devId, cmd.user, cmd.pswd);
                vpn.run(cb)
        }
}
/**
 * 检查VPN服务授权是否已经安装
 * @param {I} cb 回调通知函数
 */
function checkVPNCert(cb) {
        if (cb && typeof (cb) == 'function') {
                cb({ STATUS: 'EMPTY' }); // INSTALLED
        }
}
/**
 * 恢复网络配置情况
 * @param {I} res HTTP响应对象
 */
function __resp_net_conf(res) {
        let data = { STATUS: 'SUCCESS', MSG: '', count: 0 };
        try {
                let conf_file = new NETCONF();
                let __data = conf_file.data();
                data.wlan = __data.wlan;
                data.eth = __data.eth;

                data.count = 1 + data.eth.length;
                for (let i = 0; i < data.eth.length; i++) {
                        if (data.eth[i].multi)
                                data.count += data.eth[i].multi.length;
                }
                res.send(JSON.stringify(data));
        } catch (e) {
                console.log(e);
                data.STATUS = 'FAIL';
                data.MSG = '网关网络配置文件格式错误';
        }
        res.send(data);
}
/**
 * @brief 反馈wifi参数
 */
function __resp_wifi_conf(res) {
        const wpaConf = require('./wpaConf.js')
        let __data = { STATUS: 'SUCCESS' };
        try {
                let conf = new wpaConf();
                __data = conf.data();
                __data.STATUS = 'SUCCESS';
        } catch (e) {
                __data.STATUS = 'FAIL';
                __data.MSG = "获取WIFI配置参数失败";
        }
        res.send(JSON.stringify(__data));
}
/**
 * 反馈VPN配置信息
 * @param {I} res 
 */
function __resp_vpn_conf(res) {
        let vpnConf = FS.readFileSync('./etc/vpnconf.json');

        let vpnData = { STATUS: 'STATUS' };
        try {
                vpnData = JSON.parse(vpnConf);
                vpnData.STATUS = 'SUCCESS';
        } catch (e) {
                vpnData.STATUS = 'FAIL';
                vpnData.MSG = "获取VPN配置失败";
        }

        res.send(JSON.stringify(vpnData));
}
/**
 * 反馈串口配置信息
 */
function __initCom(res) {
        let _data1 = FS.readFileSync('./etc/config.json');
        let json_com = FS.readFileSync('./etc/com.json', 'utf-8');
        let json_com2 = JSON.parse(json_com)
        let json = JSON.parse(_data1);
        let path = json.xmlconf;
        let comData = { STATUS: 'STATUS' };
        FS.readFile(path, 'utf-8', function (error, data) {
                if (!error) {
                        let x2js = new X2JS();
                        data2 = x2js.xml2js(data);
                        comData.COMS = json_com2;
                        comData.CONF_FILE = data2;
                        comData.STATUS = 'SUCCESS';
                } else {
                        comData.STATUS = 'FAIL';
                        comData.MSG = '获取串口配置失败';
                }
                res.send(JSON.stringify(comData));
        });
}

router.post("/api/info", (req, res) => {
        let json = req.body;

        switch (json.CMD) {
                case 'NET_CONF':
                        __resp_net_conf(res);
                        break;
                case 'WIFI_CONF':
                        __resp_wifi_conf(res);
                        break;
                case 'VPN_CONF':
                        __resp_vpn_conf(res);
                        break;
                case 'COM_CONF':
                        __initCom(res);

        }
});
/**
 * @brief 判断VPN是否在运行
 */
function __vpn_is_run() {
        return new Promise((res, rej) => {
                exec("ps -ef|grep openvpn", (err, stdout) => {  // 查询VPN进程
                        console.log("__vpn_is_run() :: ------------------\n" + stdout + "\n------------------------------");
                        if (err) {
                                console.log(err);
                                rej();
                        }
                        let lines = stdout.split('\n');
                        if (lines.length > 2) {
                                for (let l in lines) {
                                        if (lines[l].indexOf('--config') != -1) {
                                                res(true)
                                        }
                                }
                                res(false)
                        } else {
                                res(false);
                        }
                });
        })
}

/**
 * 修改tap为混杂模式
 */
function __modify_tap_add() {
        return new Promise((res, rej) => {
                exec("ifconfig", (err, stdout, stderr) => {
                        let lines = stdout.split('\n');
                        let tap_data = [];
                        let find_tap = 0;
                        for (let l in lines) {
                                if (lines[l].indexOf('tap') < 0) {
                                        if (find_tap == 0) continue;    // 持续查找tap设备
                                        if (find_tap == 1) {             // 处理tap设备的后续行
                                                if (lines[l].match(/^w+\s/)) { // 再次遇到接口数据，说明处理完tap数据
                                                        break;
                                                }
                                                tap_data.push(lines[l]); // 整理TAP数据
                                        }
                                } else { // 处理第一行tap数据
                                        find_tap = 1;
                                        tap_data.push(lines[l]);
                                }
                        }
                        if (tap_data.length == 0) {  // 没有找到tap数据
                                rej(false);
                        } else {  // 在tap数据中找到tap的ip地址，将这个地址给网桥同时把网桥的地址设置为0.0.0.0
                                for (let tapl in tap_data) {
                                        let sm = tap_data[tapl].match(/(?<=inet\s+addr:)\d{1,3}(\.\d{1,3}){3}/);
                                        if (sm) {
                                                __exec_cmd("ifconfig br0 " + sm[0]);
                                                find_tap = 2;
                                                break;
                                        }
                                }
                                if (find_tap == 2) { // 完成了网桥数据配置，继续完成tap更改
                                        __exec_cmd("ifconfig tap0 0.0.0.0");
                                        res(true);
                                } else {
                                        console.log("找不到tap接口");
                                        res(false);
                                }
                        }
                });
        });
}

function __start_vpn_cmd() {
        let ret = new Promise((res, rej) => {
                setTimeout(() => {
                        exec("ifconfig", (err, stdo, stde) => {
                                let lines = stdo.split('\n');

                                for (let l in lines) {
                                        if (lines[l].indexOf("tap") != -1) { // 彉¾佈°孾L彈~P庠~G记
                                                res(true);
                                        }
                                }
                                res(false);
                        });
                }, 10000);
                exec("openvpn --config /etc/openvpn/client.ovpn", { cwd: "/usr/sbin", shell: "/bin/bash" }, (err, stdo, stde) => {
                        if (err) {
                                rej("start openvpn fail.");
                        }

                        let lines = stdo.split('\n');

                        for (let l in lines) {
                                if (lines[l].indexOf("Initialization Sequence Completed") != -1) { // 找到完成标记
                                        res(true);
                                }
                        }

                        res(false);
                })
        });

        ret.catch((e) => {
                console.log(e);
        })

        return ret;
}
/**
 * 启动VPN，并构建网桥
 * @param {I} res 
 */
async function __start_vpn(res) {
        let chk = await __vpn_is_run();
        if (chk == true) {
                res.send(JSON.stringify({ STATUS: 'FAIL', MSG: 'VPN正在运行' }));
                return;
        } else {
                chk = await __start_vpn_cmd();
                if (chk == true) { //vpn启动成功，则创建网桥
                        await __exec_cmd('brctl addbr br0');
                        //await __exec_cmd( 'brctl addif eth0' );
                        await __exec_cmd('brctl addif br0 eth1');
                        await __exec_cmd('brctl addif br0 tap0');

                        chk = await __modify_tap_add();
                        if (chk == true) {
                                //await __exec_cmd( "ifconfig eth0 0.0.0.0" );
                                await __exec_cmd("ifconfig eth1 0.0.0.0");
                                await __exec_cmd("ifconfig br0 up");
                                res.send(JSON.stringify({ STATUS: 'SUCCESS' }));
                        } else {

                        }

                } else {
                        res.send(JSON.stringify({ STATUS: 'FAIL', MSG: '启动VPN失败' }));
                }
        }
}
/**
 * 关闭VPN并且关闭网桥
 * @param {I} res 
 */
async function __stop_vpn(res) {
        await __exec_cmd("brctl delif eth1;");        // 从网桥中移除eth1
        //await __exec_cmd( "brctl delif eth0" );
        await __exec_cmd("brctl delif tap0");         // 从网桥中移除tap0
        await __exec_cmd("ifconfig br0 down");        // 关闭网桥
        await __exec_cmd("brctl delbr br0");

        exec("ps -ef|grep openvpn", (err, stdout) => {  // 查询VPN进程
                if (err) {
                        console.log(err);
                        return;
                }
                let lines = stdout.split('\n');
                if (lines.length > 1) {                // openvpn正在运行
                        let pids = lines[0].match(/(?<=root\s+)\d+/);              // 匹配PID                                               
                        if (pids.length > 0) {
                                let pid = pids[0];
                                exec("kill -9 " + pid, (err, stdout) => {          // 关闭
                                        if (err) {
                                                console.log(err);
                                                res.send(JSON.stringify({ STATUS: 'FAIL', MSG: '关闭进程操作失败' }));
                                        } else {
                                                res.send(JSON.stringify({ STATUS: 'SUCCESS' }));
                                        }
                                });
                        }
                } else {
                        res.send(JSON.stringify({ STATUS: 'FAIL', MSG: 'Openvpn没有运行' }));
                }
        });
}
/**
 * @brief 启动或者停止VPN
 * @param {I} sw , true 启动VPN， false 关闭VPN
 */
function __run_vpn(sw, res) {
        if (sw == 'true') {
                __start_vpn(res);
        } else {
                __stop_vpn(res);
        }
}
/**
 * 配置串口信息
 * @param { I } param  
 * @param { I } cb
 */
function saveCom0(param, cb) {
        let _data1 = FS.readFileSync('./etc/config.json');
        let json = JSON.parse(_data1)
        let path = json.xmlconf
        FS.readFile(path, 'utf-8', function (error, data) {
                if (!error) {
                        var X2JS = require("x2js")
                        var x2js = new X2JS();
                        var jsonObj = x2js.xml2js(data);
                        if (cb && typeof (cb) == 'function') {
                                let com_data = FS.readFileSync("./etc/com.json");
                                let json_com = JSON.parse(com_data);
                                let devName = getDevName();
                                for (let i in json_com.data) {
                                        let devNamedesc = json_com.data[i];
                                        if (devNamedesc.dev == devName) {
                                                for (let j = 0; j < devNamedesc.coms.length; j++) {
                                                        if (devNamedesc.coms[j].name == param.name) {
                                                                jsonObj.CONF_FILE.dir[0].var[0]._value = devNamedesc.coms[j].value;
                                                                break;
                                                        }
                                                }
                                        }
                                }
                                jsonObj.CONF_FILE.dir[0].var[1]._value = param.baud;
                                jsonObj.CONF_FILE.dir[0].var[2]._value = param.char_len;
                                jsonObj.CONF_FILE.dir[0].var[3]._value = param.stop;
                                jsonObj.CONF_FILE.dir[0].var[4]._value = param.parity;
                                jsonObj.CONF_FILE.dir[0].var[5]._value = param.flow;
                                jsonObj.CONF_FILE.dir[1].var[0]._value = param.server;
                                jsonObj.CONF_FILE.dir[1].var[1]._value = param.port;
                        }
                        var xml = x2js.js2xml(jsonObj);
                        FS.writeFileSync(path, xml, (err) => {
                                if (!err) {
                                        cb({ STATUS: 'success' })
                                }
                                cb({ STATUS: 'fail' })
                        });
                } else {
                        console.log(e)
                }
        });
        return;
}

router.post("/api/config", (req, res) => {
        let json = req.body;
        let CMD = "";
        let rst_data = {
                STATUS: "SUCCESS"
        }
        CMD = json.CMD;
        switch (CMD) {
                case 'REBOOT':
                        exec('sync');    // 执行同步命令，保证文件能够从内存中同步到FLASH中
                        setTimeout(() => {  // 等待5s，执行重新启动
                                exec('reboot now', (err, stdout, stderr) => { })
                        }, 5000)
                        res.send(JSON.stringify(rst_data));
                        break;
                case 'SET_CERT':
                        installVpnCert(json, (rst) => {
                                res.send(JSON.stringify(rst));
                        });
                        break;
                case 'CHECK_VPN_CERT':
                        checkVPNCert((rst) => {
                                res.send(JSON.stringify(rst));
                        });

                        break;
                case 'SAVE_WIFI':
                        saveWifi(json, (rst) => {

                                res.send(JSON.stringify(rst));
                        });
                        break;
                case 'SAVE_NET': {
                        let rst = doSaveNet(json);
                        if (rst == false) {
                                rst_data.STATUS = "FAIL";
                        }
                        res.send(JSON.stringify(rst_data));
                }
                        break;
                case 'RUNNING_INFO': {
                        let data = [];
                        rst_data.data = data;
                        rst_data.count = data.length;

                        res.send(JSON.stringify(rst_data));
                }
                        break;
                case 'DEV_INFO': {
                        let data = FS.readFileSync("./etc/devInfo.json");
                        let json = JSON.parse(data);

                        rst_data.data = [{ name: 'SN', value: DEV_SN }];
                        rst_data.data = rst_data.data.concat(json.ISG100_R01.data);
                        rst_data.count = json.ISG100_R01.data.length;
                        res.send(JSON.stringify(rst_data));
                }
                        break;
                case 'START_VPN':
                        __run_vpn(json.sw, res);
                        break;
                case 'SCAN_WIFI': {
                        rst_data.data = [];
                        rst_data.count = 0;
                        exec('wpa_cli -i wlan0 scan', (err, stdout) => {
                                exec('wpa_cli -i wlan0 scan_result', { encoding: 'utf-8' }, (error, stdout, stderr) => {
                                        if (error) {
                                                rst_data.STATUS = 'SCAN_WIFI_FAIL';
                                                console.log(stderr)
                                                rst_data.data.push(stderr);
                                                res.send(JSON.stringify(rst_data));
                                                return;
                                        }
                                        let line = '';
                                        let pos = -1;
                                        let data = stdout;
                                        while (data.length > 0) {
                                                if ((pos = data.indexOf('\r\n')) != -1) {
                                                        line = data.substr(0, pos);
                                                        data = data.substr(pos + 2, data.length);
                                                        rst_data.data.push(line);
                                                        rst_data.count++;
                                                } else if ((pos = data.indexOf('\n')) != -1) {
                                                        line = data.substr(0, pos);
                                                        data = data.substr(pos + 1, data.length);
                                                        rst_data.data.push(line);
                                                        rst_data.count++;
                                                } else {
                                                        data = '';
                                                }
                                        }
                                        res.send(JSON.stringify(rst_data));
                                })
                        });
                }
                        break;
                case 'SAVE_COM0': {
                        saveCom0(json, (rst) => {
                                if (rst == false) {
                                        rst_data = 'FAIL';
                                }
                        });
                        res.send(JSON.stringify(rst_data));
                }
                        break;
        }
});

initDevID();

module.exports = router;
