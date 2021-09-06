/**
 * @brief WPA 配置文件接口模块
 * @version 1.0
 * @date 2020-9-11
 * @author 宋炜
 */

const FS = require('fs')
class wpaConf {
        constructor() {
                this.__m_data = {
                        ctrl_interface: "/var/run/wpa_supplicant",
                        ctrl_interface_group: 0,
                        update_config: 1,
                        ap_scan: 1,
                        network: {
                                ssid: "ROCK_Test",
                                key_mgmt:"WPA-PSK",
                                proto:"WPA",
                                pairwise:"CCMP",
                                group:"CCMP",
                                psk: "rock123456"
                        }
                };

                this.__load();
        }
        /**
         * @brief 读入文件
         */
        __load() {
                let _data1 = FS.readFileSync('./etc/config.json');
                let json = JSON.parse(_data1);
                let path = json.wpa_supplicant;
                let data = FS.readFileSync(path);
                data = data.toString();
                let map = new Map();
                let lines = data.split('\n');
                let network = '';
                for (let line in lines) {
                        if (lines[line] == '}' || lines[line] == '}\n') continue;
                        let key_value = lines[line].split('=');
                        if (key_value[0] == 'network') {
                                network = key_value;
                                continue;
                        }
                        data = key_value[0].match(/[\w_]+/g);
                        if (data) data = data[0];
                        if (network.length > 0) {
                                map.set('network.' + data, key_value[1]);
                        } else {
                                map.set(data, key_value[1]);
                        }
                }
                let obj = this;
                map.forEach((value, key) => {
                        switch (key) {
                                case 'ctrl_interface':
                                        obj.__m_data.ctrl_interface = value;
                                        break;
                                case 'ctrl_interface_group':
                                        obj.__m_data.ctrl_interface_group = value;
                                        break;
                                case 'update_config':
                                        obj.__m_data.update_config = value;
                                        break;
                                case 'ap_scan':
                                        obj.__m_data.ap_scan = value;
                                        break;
                                case 'network.ssid': {
                                        let datt = value.split("\"")
                                        obj.__m_data.network.ssid = datt[1];
                                }
                                        break;
                                case 'network.key_mgmt':
                                        obj.__m_data.network.key_mgmt = value;
                                        break;
                                case 'network.proto':
                                        obj.__m_data.network.proto = value;
                                        break;
                                case 'network.pairwise':
                                        obj.__m_data.network.pairwise = value;
                                        break;
                                case 'network.group':
                                        obj.__m_data.network.group = value;
                                        break;
                                case 'network.psk': {
                                        let datt2 = value.split("\"")
                                        obj.__m_data.network.psk = datt2[1];
                                }
                                        break;
                        }
                })
        }
        /**
         * 指定值
         * @param {*} key 
         * @param {*} value 
         */
        setValue(key, value) {
                let keys = key.split('.')
                let obj = this.__m_data;
                let is_find = false;
                let i;
                for (i in keys) {
                        for (let v in obj) {
                                if (i != keys.length - 1 && v == keys[i]) {
                                        obj = obj[v];
                                        break;
                                } else if (v == keys[i]) {
                                        break;
                                }
                        }
                }
                if (obj)
                        obj[keys[i]] = value;
        }

        __dataForEach(enC, parent, data, func) {
                for (let key in data) {
                        func(enC, false, parent, key, data[key]);
                        enC = false;
                        if (typeof (data[key]) == "object") {
                                this.__dataForEach(true, key, data[key], func); // 进入到下级
                                func(false, true);  // 退回到上级
                        }
                }
        }
        /**
         * @brief 保存文件
         */
        save() {
                let str = '';
                this.__dataForEach(false, "", this.__m_data, (enC, bkP, parent, key, value) => {

                        if (enC == true) {
                                str += parent + '={\n';  // 增加下级大括号
                        }

                        if (bkP == true) {
                                str += "}\n";            // 关闭下级大括号
                                return;
                        }

                        switch (key) {
                                case 'ctrl_interface':
                                        str += 'ctrl_interface=' + value + "\n";
                                        break;
                                case 'ctrl_interface_group':
                                        str += 'ctrl_interface_group=' + value + "\n";
                                        break;
                                case 'update_config':
                                        str += 'update_config=' + value + "\n";
                                        break;
                                case 'ap_scan':
                                        str += 'ap_scan=' + value + "\n";
                                        break;
                                case 'ssid':
                                        str += '\tssid="' + value + '"\n';
                                        break;
                                case 'key_mgmt':
                                        str += '\tkey_mgmt=' + value + "\n";
                                        break;
                                case 'proto':
                                        str += '\tproto=' + value + "\n";
                                        break;
                                case 'pairwise':
                                        str += '\tpairwise=' + value + "\n";
                                        break;
                                case 'group':
                                        str += '\tgroup=' + value + "\n";
                                        break;
                                case 'psk':
                                        str += '\tpsk="' + value + '"\n';
                                        break;
                        }
                })
                let _data1 = FS.readFileSync('./etc/config.json');
                let json = JSON.parse(_data1);
                let path = json.wpa_supplicant;
                var len = FS.writeFileSync(path, str);
                if (len == str.length) return true;
                return false;
        }

        data() {
                return this.__m_data;
        }
}

module.exports = wpaConf;