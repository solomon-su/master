/**
 * @brief 网络接口配置文件管理模块。解析网络interface文件，可以配置参数并生成文件保存结果。
 *      解析模式构造一个解析状态机。
 * @version 1.0
 * @date 2020-9-14
 * @author 宋炜 
 */
/*   
 * 文件格式如下。
 *    1  以 # 开始的行是注释行
 *    2  以auto 开始，到空白行是一个接口的描述
 *    3  lo 是本地回环; ethX是有线网；wlanX是WiFi
 *      
 *       # /etc/network/interfaces -- configuration file for ifup(8), ifdown(8)
 *
 *       # The loopback interface
 *       auto lo
 *       iface lo inet loopback
 *
 *       # Wireless interfaces
 *       auto wlan0
 *       iface wlan0 inet dhcp
 *               wireless_mode managed
 *               wireless_essid any
 *               wpa-driver wext
 *               wpa-conf /etc/wpa_supplicant.conf
 *
 *       iface atml0 inet dhcp
 *
 *       # Wired or wireless interfaces
 *       auto eth0
 *       iface eth0 inet static
 *       address 192.168.1.52
 *       netmask 255.255.255.0
 *       gateway 192.168.1.33
 *       auto eth1
 *       iface eth1 inet dhcp
 *
 *       # Bluetooth networking
 *       iface bnep0 inet dhcp
 * 
 * __m_data = {               // 默认的网络配置数据
                        lo:{
                                interface:"",
                                family:"inet",
                                add_type:"dhcp",
                                gateway:"",
                                address:""
                        },                  
                        wlan:[
                                {
                                        interface:"",
                                        family:"inet",
                                        add_type:"dhcp",
                                        gateway:"",
                                        address:""
                                }
                        ],
                        eth:[
                                {
                                        interface:"0", family:"inet", add_type:"static", address:"192.168.3.105", mask:"255.255.255.0",gateway:"192.168.3.33",
                                        multi:[ // 用来记录多IP地址的情况
                                                { interface:"", family:"inet", add_type:"static",address:"", mask:"" }
                                        ]
                                },
                                {
                                        // eth1
                                        interface:"1", family:"inet", add_type:"dhcp", address:null, mask:null, gateway:"" ,
                                        multi:null
                                }
                        ]
                };
 *                          
 */

                const FS = require('fs')
                class netInterface
                {
                        constructor()
                        {
                                this.__status_stack = [];       // 状态栈
                                this.__m_data = {               // 默认的网络配置数据
                                        lo:{},
                                        wlan:[{interface:"0", add_type:"dhcp",family:"inet"}],
                                        eth:[{},{}]
                                };
                
                                this.__m_interface_status = {}  // 状态机状态、弧关系表
                                // 初始化文件格式解析状态机
                                this.__create_fsm();
                                this.__fsm_dst_init();
                
                                // 读取文件
                                let _data1 = FS.readFileSync('./etc/config.json');
                                let json = JSON.parse(_data1);
                                let path = json.interface;
                                let buf = FS.readFileSync(path);
                                let data = buf.toString();
                                
                                // 解析文件
                                if( this.__parserFile( data ) == false ){
                                        throw "解析网络接口配置文件失败"
                                }
                        }
                        /**
                         * @brief 过滤掉注释行
                         * @param {I} lines 要过滤的字符串数组
                         * @return 返回操作结果
                         */
                        __remove_comment( lines )
                        {
                                let ret = [];
                                for( let l in lines ){
                                        if( lines[ l ].match( /\s*#.*/g ) ){
                                                lines.splice( l , 1 );
                                                ret = this.__remove_comment( lines );
                                                break;
                                        }
                                }
                                return lines;
                        }
                        /**
                         * @brief 初始化FSM目标状态标记
                         */
                        __fsm_dst_init()
                        {
                                for( let i in this.__m_interface_status.start ){
                                        this.__m_interface_status.start[ i ].init();
                                }
                                for( let i in this.__m_interface_status.lo ){
                                        this.__m_interface_status.lo[ i ].init();
                                }
                                for( let i in this.__m_interface_status.wlan0 ){
                                        this.__m_interface_status.wlan0[ i ].init();
                                }
                                for( let i in this.__m_interface_status.eth0 ){
                                        this.__m_interface_status.eth0[ i ].init();
                                }
                                for( let i in this.__m_interface_status.eth0_x ){
                                        this.__m_interface_status.eth0_x[ i ].init();
                                }
                                for( let i in this.__m_interface_status.eth1 ){
                                        this.__m_interface_status.eth1[ i ].init();
                                }
                                for( let i in this.__m_interface_status.eth1_x ){
                                        this.__m_interface_status.eth1_x[ i ].init();
                                }
                                for( let i in this.__m_interface_status.atml0 ){
                                        this.__m_interface_status.atml0[ i ].init();
                                }
                                for( let i in this.__m_interface_status.iface ){
                                        this.__m_interface_status.iface[ i ].init();
                                }
                                for( let i in this.__m_interface_status.address ){
                                        this.__m_interface_status.address[ i ].init();
                                }
                                for( let i in this.__m_interface_status.netmask ){
                                        this.__m_interface_status.netmask[ i ].init();
                                }
                                for( let i in this.__m_interface_status.gateway ){
                                        this.__m_interface_status.gateway[ i ].init();
                                }
                                for(let i in this.__m_interface_status.br0) {
                                        this.__m_interface_status.br0[i].init();
                                }
                        }
                        /**
                         * @brief 构建解析状态机
                         */
                        __create_fsm()
                        {
                                let __obj = this;
                                this.__m_interface_status = {
                                        start:[ 
                                                { 
                                                        reg:/auto\s+lo/g, 
                                                        dst:null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.start[ 0 ].dst = __obj.__m_interface_status.lo;
                                                        },
                                                        trig:( data )=>{
                                                                let names = data.split( " " );
                                                                if( names )
                                                                        names = names[ 1 ];
                                                                __obj.__status_stack.push( names );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+wlan0/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.start[ 1 ].dst = __obj.__m_interface_status.wlan0;
                                                        },
                                                        trig:( data )=>{
                                                                let names = data.split( " " );
                                                                if( names )
                                                                        names = names[ 1 ];
                                                                __obj.__status_stack.push( names );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth0$/g, 
                                                        dst:null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.start[ 2 ].dst = __obj.__m_interface_status.eth0;
                                                        },
                                                        trig:( data )=>{
                                                                let names = data.split( " " );
                                                                if( names )
                                                                        names = names[ 1 ];
                                                                __obj.__status_stack.push( names );
                                                        }
                                                },
                                                {
                                                        reg:/auto\s+eth0:\d+/g,
                                                        dst:null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.start[ 3 ].dst = __obj.__m_interface_status.eth0_x;
                                                        },
                                                        trig:( data )=>{
                                                                let names = data.split( /\s/g );
                                                                if( names )
                                                                        names = names[ 1 ];
                                                                __obj.__status_stack.push( names );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth1$/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.start[ 4 ].dst = __obj.__m_interface_status.eth1;
                                                        },
                                                        trig:( data )=>{
                                                                let names = data.split( " " );
                                                                if( names )
                                                                        names = names[ 1 ];
                                                                        __obj.__status_stack.push( names );
                                                        }
                                                },
                                                {
                                                        reg:/auto\s+eth1:\d+/g,
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.start[ 5 ].dst = __obj.__m_interface_status.eth1_x;
                                                        },
                                                        trig:( data )=>{
                                                                let names = data.split( " " );
                                                                if( names )
                                                                        names = names[ 1 ];
                                                                __obj.__status_stack.push( names );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+atml0/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.start[ 6 ].dst = __obj.__m_interface_status.atml0;
                                                        },
                                                        trig:( data )=>{
                                                                let names = data.split( " " );
                                                                if( names )
                                                                        names = names[ 1 ];
                                                                __obj.__status_stack.push( names );
                                                        }
                                                },
                                                { 
                                                        reg:/iface\s+bnep0/g, 
                                                        dst:null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.start[ 7 ].dst = __obj.__m_interface_status.bnep0;
                                                        },
                                                        trig:( data )=>{
                                                                let names = data.split( " " );
                                                                if( names )
                                                                        names = names[ 1 ];
                                                                __obj.__status_stack.push( names );
                                                        }
                                                },
                                                {
                                                        reg:/auto\s+br0/g,
                                                        dst:null,
                                                        init:()=>{
                                                                __obj.__m_interface_status.start[8].dst = __obj.__m_interface_status.br0;
                                                        },
                                                        trig:(data)=>{
                                                                let names = data.split(" ");
                                                                if(names) {
                                                                        names = names[1];
                                                                }
                                                                __obj.__status_stack.push(names);
                                                        }
                                                }
                                        ],
                                        lo:[ 
                                                { 
                                                        reg:/iface\s+/g , 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.lo[ 0 ].dst = __obj.__m_interface_status.iface;
                                                        },
                                                        trig:( data )=>{
                                                                let params = data.split( /\s+/g );
                                                                if( params ){
                                                                        __obj.__m_data.lo.family=params[ 2 ];
                                                                        __obj.__m_data.lo.add_type=params[ 3 ];
                                                                }
                                                        }
                                                } 
                                        ],
                                        wlan0:[ 
                                                { 
                                                        reg:/iface\s+/g , 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.wlan0[ 0 ].dst = __obj.__m_interface_status.iface;
                                                        },
                                                        trig:( data )=>{
                                                                let params = data.split( /\s+/g );
                                                                if( params ){
                                                                        let itfc = params[ 1 ].match( /\d+/g);
                                                                        if( itfc ) itfc = itfc[ 0 ];
                                                                        if( __obj.__m_data.wlan.length < 1 ){
                                                                                __obj.__m_data.wlan = [{ 
                                                                                        interface:itfc, 
                                                                                        family:params[ 2 ],
                                                                                        add_type:params[ 3 ]
                                                                                }]
                                                                        }else{
                                                                                __obj.__m_data.wlan[ 0 ].interface = itfc;
                                                                                __obj.__m_data.wlan[ 0 ].family=params[ 2 ];
                                                                                __obj.__m_data.wlan[ 0 ].add_type=params[ 3 ];
                                                                        }
                                                                }
                                                        }
                                                }
                                        ],
                                        eth0:[ 
                                                { 
                                                        reg:/iface\s+/g , 
                                                        dst:null ,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.eth0[ 0 ].dst = __obj.__m_interface_status.iface;
                                                        },
                                                        trig:( data )=>{
                                                                let params = data.split( /\s+/g );
                                                                if( params ){
                                                                        let itfc = params[ 1 ].match( /\d+/g);
                                                                        if( itfc ) itfc = itfc[ 0 ];
                                                                        
                                                                        if( __obj.__m_data.eth.length < 1 ){
                                                                                __obj.__m_data.eth = [{ 
                                                                                        interface:itfc, 
                                                                                        family:params[ 2 ],
                                                                                        add_type:params[ 3 ]
                                                                                }]
                                                                                
                                                                        }else{
                                                                                __obj.__m_data.eth[ 0 ].interface = itfc;
                                                                                __obj.__m_data.eth[ 0 ].family=params[ 2 ];
                                                                                __obj.__m_data.eth[ 0 ].add_type=params[ 3 ];
                                                                        }
                                                                }                                                
                                                        }
                                                }
                                        ],
                                        eth0_x:[ 
                                                { 
                                                        reg:/iface\s+/g , 
                                                        dst:null ,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.eth0_x[ 0 ].dst = __obj.__m_interface_status.iface;
                                                        },
                                                        trig:( data )=>{
                                                                if( __obj.__m_data.eth.length < 2 ){ // 如果出事对象数量不足，则增加数量
                                                                        for( let i = obj.__m_data.eth.length; i < 2; i ++ ){
                                                                                __obj.__m_data.eth.push({})
                                                                        }
                                                                }
                                                                let params = data.split( /\s+/g );
                                                                if( params ){
                                                                        let mutil_idx = __obj.__status_stack[ __obj.__status_stack.length - 1 ];
                                                                        mutil_idx = mutil_idx.split( ":" );
                                                                        mutil_idx = mutil_idx[ 1 ];
                                                                        if( __obj.__m_data.eth[ 0 ].multi ){
                                                                                for( let i = __obj.__m_data.eth[ 0 ].multi.length; i < mutil_idx; i ++ ){
                                                                                        __obj.__m_data.eth[ 0 ].multi.push({})
                                                                                }
                                                                                __obj.__m_data.eth[ 0 ].multi[ mutil_idx - 1].interface = mutil_idx;
                                                                                __obj.__m_data.eth[ 0 ].multi[ mutil_idx - 1].family=params[ 2 ];
                                                                                __obj.__m_data.eth[ 0 ].multi[ mutil_idx - 1].add_type=params[ 3 ];
                                                                        }else{
                                                                                __obj.__m_data.eth[ 0 ].multi = [{ interface:mutil_idx , family : params[ 2 ], add_type: params[ 3 ]}];         
                                                                        }
                                        
                                                                }                                                
                                                        }
                                                }
                                        ],
                                        eth1:[ 
                                                { 
                                                        reg:/iface\s+/g , 
                                                        dst:null ,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.eth1[ 0 ].dst = __obj.__m_interface_status.iface;
                                                        },
                                                        trig:( data )=>{
                                                                if( __obj.__m_data.eth.length < 2 ){ // 如果出事对象数量不足，则增加数量
                                                                        for( let i = __obj.__m_data.eth.length; i < 2; i ++ ){
                                                                                __obj.__m_data.eth.push({})
                                                                        }
                                                                }
                                                                let params = data.split( /\s+/g );
                                                                if( params ){
                                                                        let params = data.split( /\s+/g );
                                                                        if( params ){
                                                                                let itfc = params[ 1 ].match( /\d+/g);
                                                                                if( itfc ) itfc = itfc[ 0 ];
                                                                                if( __obj.__m_data.eth.length < 2 ){
                                                                                        if( __obj.m_data.eth.length < 1 ){
                                                                                                __obj.__m_data.eth = [{},{ 
                                                                                                        interface:itfc, 
                                                                                                        family:params[ 2 ],
                                                                                                        add_type:params[ 3 ]
                                                                                                }];  
                                                                                        }else{
                                                                                                __obj.__m_data.eth.push({ 
                                                                                                        interface:itfc, 
                                                                                                        family:params[ 2 ],
                                                                                                        add_type:params[ 3 ]
                                                                                                });  
                                                                                        }
                                                                                }else{
                                                                                        __obj.__m_data.eth[ 1 ].interface = itfc;
                                                                                        __obj.__m_data.eth[ 1 ].family=params[ 2 ];
                                                                                        __obj.__m_data.eth[ 1 ].add_type=params[ 3 ];
                                                                                }
                                                                        }  
                                                                }                                                
                                                        }
                                                }
                                        ],
                                        eth1_x:[ 
                                                { 
                                                        reg:/iface\s+/g , 
                                                        dst:null ,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.eth1_x[ 0 ].dst = __obj.__m_interface_status.iface;
                                                        },
                                                        trig:( data )=>{
                                                                if( __obj.__m_data.eth.length < 2 ){ // 如果出事对象数量不足，则增加数量
                                                                        for( let i = obj.__m_data.eth.length; i < 2; i ++ ){
                                                                                __obj.__m_data.eth.push({})
                                                                        }
                                                                }
                                                                let params = data.split( /\s+/g );
                                                                if( params ){
                                                                        let mutil_idx = __obj.__status_stack[ __obj.__status_stack.length - 1 ];
                                                                        mutil_idx = mutil_idx.split( ":" );
                                                                        mutil_idx = mutil_idx[ 1 ];
                                                                        if( __obj.__m_data.eth[ 1 ].multi ){
                                                                                for( let i = __obj.__m_data.eth[ 0 ].multi.length; i < mutil_idx; i ++ ){
                                                                                        __obj.__m_data.eth[ 0 ].multi.push({})
                                                                                }
                                                                                __obj.__m_data.eth[ 1 ].multi[ mutil_idx - 1 ].interface = mutil_idx;
                                                                                __obj.__m_data.eth[ 1 ].multi[ mutil_idx - 1 ].family=params[ 2 ];
                                                                                __obj.__m_data.eth[ 1 ].multi[ mutil_idx - 1 ].add_type=params[ 3 ];
                                                                        }else{
                                                                                __obj.__m_data.eth[ 1 ].multi = [{ interface:mutil_idx , family : params[ 2 ], add_type: params[ 3 ]}];         
                                                                        }
                                        
                                                                }                                              
                                                        }
                                                }
                                        ],
                                        atml0:[ 
                                                { 
                                                        reg:/iface\s+/g , 
                                                        dst:null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.atml0[ 0 ].dst = __obj.__m_interface_status.iface;
                                                        },
                                                        trig:( data )=>{
                                                                
                                                        }
                                                }
                                        ],
                                        br0:[
                                                {
                                                        reg:/iface\s+/g,
                                                        dst:null,
                                                        init:()=>{
                                                                __obj.__m_interface_status.br0[0].dst = __obj.__m_interface_status.iface;
                                                        },
                                                        trig:(data)=>{
                                                                let params = data.split( /\s+/g );
                                                                if( params ){
                                                                        let itfc = params[ 1 ].match( /\d+/g);
                                                                        if( itfc ) itfc = itfc[ 0 ];
                                                                        
                                                                        if( __obj.__m_data.eth.length < 1 ){
                                                                                __obj.__m_data.eth = [{ 
                                                                                        interface:itfc, 
                                                                                        family:params[ 2 ],
                                                                                        add_type:params[ 3 ]
                                                                                }]
                                                                                
                                                                        }else{
                                                                                __obj.__m_data.eth[ 0 ].interface = itfc;
                                                                                __obj.__m_data.eth[ 0 ].family=params[ 2 ];
                                                                                __obj.__m_data.eth[ 0 ].add_type=params[ 3 ];
                                                                        }
                                                                }                  
                                                        }
                                                }
                                        ],
                                        iface:[{ 
                                                        reg:/auto\s+lo/g, 
                                                        dst:null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.iface[ 0 ].dst = __obj.__m_interface_status.lo;
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( 'lo' );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+wlan0/g, 
                                                        dst:null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.iface[ 1 ].dst = __obj.__m_interface_status.wlan0;
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( 'wlan0' );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth0$/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.iface[ 2 ].dst = __obj.__m_interface_status.eth0;
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( 'eth0' );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth0:\d+/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.iface[ 3 ].dst = __obj.__m_interface_status.eth0_x;
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                let info = data.split( ':' )
                                                                __obj.__status_stack.push( 'eth0:' + info[ 1 ] );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth1$/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.iface[ 4 ].dst = __obj.__m_interface_status.eth1;
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( 'eth1' );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth1:\d+/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.iface[ 5 ].dst = __obj.__m_interface_status.eth1_x;
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                let info = data.split( ':')
                                                                __obj.__status_stack.push( 'eth1:' + info[ 1 ] );
                                                        }
                                                },
                                                { 
                                                        reg:/iface\s+/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.iface[ 6 ].dst = __obj.__m_interface_status.iface;
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                let ifc = data.split( " " );
                                                                // NOTE (2020-9-16) : 不清楚在iface的情况下是否在遇见iface, 或者在address 等具体数据的情况下
                                                                //    遇见iface，这个时候应该切换接口，并设置新的接口相关内容。
                                                                __obj.__process_ifce_2_ifce( ifc ) 
                                                        }
                                                },
                                                { 
                                                        reg:/address\s+/g,
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.iface[ 7 ].dst = __obj.__m_interface_status.address;
                                                        },
                                                        trig:( data )=>{ //
                                                               let params = data.split( /\s+/g );
                                                               let ifcename = __obj.__status_stack[ __obj.__status_stack.length - 1 ];
                                                               __obj.__set_address( ifcename , params[ 1 ]);
                                                        }
                                                },
                                                { 
                                                        reg:/netmask\s+/g,
                                                        dst: null ,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.iface[ 8 ].dst = __obj.__m_interface_status.netmask;
                                                        },
                                                        trig:( data )=>{
                                                                let params = data.split( /\s+/g );
                                                               let ifcename = __obj.__status_stack[ __obj.__status_stack.length - 1 ];
                                                               __obj.__set_mask( ifcename , params[ 1 ]);
                                                        }
                                                },
                                                { 
                                                        reg:/gateway\s+/g,
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.iface[ 9 ].dst = __obj.__m_interface_status.gateway;
                                                        },
                                                        trig:( data )=>{
                                                                let params = data.split( /\s+/g );
                                                               let ifcename = __obj.__status_stack[ __obj.__status_stack.length - 1 ];
                                                               __obj.__set_gate_way( ifcename , params[ 1 ]);
                                                        }
                                                },
                                                {
                                                        reg:/auto\s+br0$/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.iface[ 10 ].dst = __obj.__m_interface_status.br0;
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( 'br0' );
                                                        }
                                                }
                                        ],
                                        address:[
                                                { 
                                                        reg:/auto\s+lo/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.address[ 0 ].dst = __obj.__m_interface_status.lo
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( 'lo' );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+wlan0/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.address[ 1 ].dst = __obj.__m_interface_status.wlan0
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( 'wlan0' );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth0$/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.address[ 2 ].dst = __obj.__m_interface_status.eth0
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( 'eth0' );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth0:\d+/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.address[ 3 ].dst = __obj.__m_interface_status.eth0_x
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                let info = data.split( ":" )
                                                                __obj.__status_stack.push( 'eth0:' + info[ 1 ] );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth1$/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.address[ 4 ].dst = __obj.__m_interface_status.eth1
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( 'eth1' );
                                                        }
                                                },  
                                                { 
                                                        reg:/auto\s+eth1:\d+/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.address[ 5 ].dst = __obj.__m_interface_status.eth1_x
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                let info = data.split( ':' );
                                                                __obj.__status_stack.push( 'eth1:' + info[ 1 ] );
                                                        }
                                                },       
                                                { 
                                                        reg:/netmask\s+/g,
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.address[ 6 ].dst = __obj.__m_interface_status.netmask 
                                                        },
                                                        trig:( data )=>{
                                                                let params = data.split( /\s+/g );
                                                                let ifcename = __obj.__status_stack[ __obj.__status_stack.length - 1 ];
                                                                __obj.__set_mask( ifcename , params[ 1 ]);
                                                        }
                                                },
                                                { 
                                                        reg:/gateway\s+/g,
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.address[ 7 ].dst = __obj.__m_interface_status.gateway 
                                                        },
                                                        trig:( data )=>{
                                                                let params = data.split( /\s+/g );
                                                                let ifcename = __obj.__status_stack[ __obj.__status_stack.length - 1 ];
                                                                __obj.__set_gate_way( ifcename , params[ 1 ]);
                                                        }
                                                }
                                        ],
                                        netmask:[
                                                { 
                                                        reg:/auto\s+lo/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.netmask[ 0 ].dst = __obj.__m_interface_status.lo
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( 'lo' );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+wlan0/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.netmask[ 1 ].dst = __obj.__m_interface_status.wlan0
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( 'wlan0' );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth0$/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.netmask[ 2 ].dst = __obj.__m_interface_status.eth0
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( 'eth0' );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth0:\d+/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.netmask[ 3 ].dst = __obj.__m_interface_status.eth0_x
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                let info = data.split( ":" );
                                                                __obj.__status_stack.push( 'eth0:' + info[ 1 ] );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth1$/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.netmask[ 4 ].dst = __obj.__m_interface_status.eth1
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( 'eth1' );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth1:\d+/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.netmask[ 5 ].dst = __obj.__m_interface_status.eth1_x
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                let info = data.split( ":" );
                                                                __obj.__status_stack.push( 'eth1:' + info[ 1 ]);
                                                        }
                                                },
                                                { 
                                                        reg:/address\s+/g,
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.netmask[ 6 ].dst = __obj.__m_interface_status.address
                                                        },
                                                        trig:( data )=>{
                                                                let params = data.split( /\s+/g );
                                                                let ifcename = __obj.__status_stack[ __obj.__status_stack.length - 1 ];
                                                                __obj.__set_address( ifcename , params[ 1 ]);
                                                        }
                                                },
                                                { 
                                                        reg:/gateway\s+/g,
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.netmask[ 7 ].dst = __obj.__m_interface_status.gateway
                                                        },
                                                        trig:( data )=>{
                                                                let params = data.split( /\s+/g );
                                                                let ifcename = __obj.__status_stack[ __obj.__status_stack.length - 1 ];
                                                                __obj.__set_gate_way( ifcename , params[ 1 ]);
                                                        }
                                                }
                                        ],
                                        gateway:[
                                                { 
                                                        reg:/auto\s+lo/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.gateway[ 0 ].dst = __obj.__m_interface_status.lo
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+wlan0/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.gateway[ 1 ].dst = __obj.__m_interface_status.wlan0
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( "wlan0" );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth0$/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.gateway[ 2 ].dst = __obj.__m_interface_status.eth0
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( "eth0" );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth0:\d+/g, 
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.gateway[ 3 ].dst = __obj.__m_interface_status.eth0_x
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                let info = data.split( ":" );
                                                                __obj.__status_stack.push( "eth0:" + info[ 1 ] );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth1$/g, 
                                                        dst: null ,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.gateway[ 4 ].dst = __obj.__m_interface_status.eth1
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                __obj.__status_stack.push( "eth1" );
                                                        }
                                                },
                                                { 
                                                        reg:/auto\s+eth1:\d+/g, 
                                                        dst: null ,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.gateway[ 5 ].dst = __obj.__m_interface_status.eth1_x
                                                        },
                                                        trig:( data )=>{
                                                                __obj.__status_stack.pop()
                                                                let info = data.split( ":" );
                                                                __obj.__status_stack.push( "eth1:" + info[ 1 ] );
                                                        }
                                                },
                                                { 
                                                        reg:/address\s+/g,
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.gateway[ 6 ].dst = __obj.__m_interface_status.address
                                                        },
                                                        trig:( data )=>{
                                                                trig:( data )=>{
                                                                        let params = data.split( /\s+/g );
                                                                        let ifcename = __status_stack[ __status_stack.length - 1 ];
                                                                        __obj.__set_address( ifcename , params[ 1 ]);
                                                                }
                                                        }
                                                },
                                                { 
                                                        reg:/netmask\s+/g,
                                                        dst: null,
                                                        init:( )=>{
                                                                __obj.__m_interface_status.gateway[ 7 ].dst = __obj.__m_interface_status.netmask
                                                        },
                                                        trig:( data )=>{
                                                                trig:( data )=>{
                                                                        let params = data.split( /\s+/g );
                                                                        let ifcename = __status_stack[ __status_stack.length - 1 ];
                                                                        __obj.__set_mask( ifcename , params[ 1 ]);
                                                                }
                                                        }
                                                }
                                        ]     
                                }
                        }
                        /**
                         * 当解析文件过程中，遇到iface 转iface，或者address 转iface等现象，使用这个函数处理
                         * @param {I} ifaceParam 
                         */
                        __process_ifce_2_ifce( ifaceParam )
                        {
                                let iface = ifaceParam[ 1 ];
                                let idx = null;
                                if( iface.indexOf(":") != -1 ){
                                        iface = iface.split( ":" );
                                        idx = iface[ 1 ];
                                        iface = iface[ 0 ];
                                }
                
                                switch( iface ){
                                case 'lo':
                                break;
                                case 'wlan0':
                                        if( idx ){
                
                                        }else{
                
                                        }
                                break;
                                case 'eth0':
                                        if( idx ){
                
                                        }else{
                
                                        }
                                break;
                                case 'eth1':
                                        if( idx ){
                
                                        }else{
                
                                        }
                                break;
                                }
                        }
                        /**
                         * 设置指定接口的IP地址
                         * @param {I} itfc 
                         * @param {I} add 
                         */
                        __set_address( itfc , add )
                        {
                                let itfcs = null;
                                if( itfc.indexOf(':') != -1 ){
                                        itfcs = itfc.split( ':' );
                                }
                                if( itfcs )
                                        itfc = itfcs[ 0 ];
                                switch( itfc ){
                                case 'lo':
                                        this.__m_data.lo.address = add;
                                break;
                                case 'wlan0':
                                        this.__m_data.wlan[ 0 ].address = add;
                                break;
                                case 'eth0':
                                        if( itfcs ){
                                                if( this.__m_data.eth[ 0 ].multi ){
                                                        for( let i = this.__m_data.eth[ 0 ].multi.length; i < parseInt( itfcs[ 1 ] ) ; i ++ ){
                                                                this.__m_data.eth[ 0 ].multi.push({});
                                                        }
                                                        this.__m_data.eth[ 0 ].multi[ parseInt( itfcs[ 1 ] ) - 1 ].address = add;
                                                }else{
                                                        this.__m_data.eth[ 0 ].multi = [{address: add }];
                                                }
                                        }else{
                                                this.__m_data.eth[ 0 ].address = add;
                                        }
                                break;
                                case 'eth1':
                                        if( itfcs ){
                                                if( this.__m_data.eth[ 1 ].multi ){
                                                        for( let i = this.__m_data.eth[ 1 ].multi.length; i < parseInt( itfcs[ 1 ] ) ; i ++ ){
                                                                this.__m_data.eth[ 1 ].multi.push({});
                                                        }
                                                        this.__m_data.eth[ 1 ].multi[ parseInt( itfcs[ 1 ] ) - 1 ].address = add;
                                                }else{
                                                        this.__m_data.eth[ 1 ].multi = [{address: add }];
                                                }
                                        }else{
                                                this.__m_data.eth[ 1 ].address = add;
                                        }
                                break;
                                }
                        }
                        /**
                         * 设置指定接口的MASK
                         * @param {I} itfc 
                         * @param {I} add 
                         */
                        __set_mask( itfc , add )
                        {
                                let itfcs = null;
                                if( itfc.indexOf(':') != -1 ){
                                        itfcs = itfc.split( ':' );
                                }
                                if( itfcs )
                                        itfc = itfcs[ 0 ];
                                switch( itfc ){
                                        case 'lo':
                                                this.__m_data.lo.mask = add;
                                        break;
                                        case 'wlan0':
                                                this.__m_data.wlan[ 0 ].mask = add;
                                        break;
                                        case 'eth0':
                                                if( itfcs ){
                                                        if( this.__m_data.eth[ 0 ].multi ){
                                                                for( let i = this.__m_data.eth[ 0 ].multi.length; i < parseInt( itfcs[ 1 ] ) ; i ++ ){
                                                                        this.__m_data.eth[ 0 ].multi.push({});
                                                                }
                                                                this.__m_data.eth[ 0 ].multi[ parseInt( itfcs[ 1 ] ) - 1 ].mask = add;
                                                        }else{
                                                                this.__m_data.eth[ 0 ].multi = [{mask: add }];
                                                        }
                                                }else{
                                                        this.__m_data.eth[ 0 ].mask = add;
                                                }
                                        break;
                                        case 'eth1':
                                                if( itfcs ){
                                                        if( this.__m_data.eth[ 1 ].multi ){
                                                                for( let i = this.__m_data.eth[ 1 ].multi.length; i < itfcs[ 1 ]; i ++ ){
                                                                        this.__m_data.eth[ 1 ].multi.push({});
                                                                }
                                                                this.__m_data.eth[ 1 ].multi[ itfcs[ 1 ] - 1 ].mask = add;
                                                        }else{
                                                                this.__m_data.eth[ 1 ].multi = [{mask: add }];
                                                        }
                                                }else{
                                                        this.__m_data.eth[ 1 ].mask = add;
                                                }
                                        break;
                                        }
                        }
                        /**
                         * 设置指定接口的网关
                         * @param {I} itfc 
                         * @param {I} add 
                         */
                        __set_gate_way( itfc , add )
                        {
                                let itfcs = null;
                                if( itfc.indexOf(':') != -1 ){
                                        itfcs = itfc.split( ':' );
                                }
                                if( itfcs )
                                        itfc = itfcs[ 0 ];
                                switch( itfc ){
                                        case 'lo':
                                                this.__m_data.lo.gateway = add;
                                        break;
                                        case 'wlan0':
                                                this.__m_data.wlan[ 0 ].gateway = add;
                                        break;
                                        case 'eth0':
                                                if( itfcs ){
                                                        if( this.__m_data.eth[ 0 ].multi ){
                                                                for( let i = this.__m_data.eth[ 0 ].multi.length; i < itfcs[ 1 ]; i ++ ){
                                                                        this.__m_data.eth[ 0 ].multi.push({});
                                                                }
                                                                this.__m_data.eth[ 0 ].multi[ itfcs[ 1 ] - 1 ].gateway = add;
                                                        }else{
                                                                this.__m_data.eth[ 0 ].multi = [{gateway: add }];
                                                        }
                                                }else{
                                                        this.__m_data.eth[ 0 ].gateway = add;
                                                }
                                        break;
                                        case 'eth1':
                                                if( itfcs ){
                                                        if( this.__m_data.eth[ 1 ].multi ){
                                                                for( let i = this.__m_data.eth[ 1 ].multi.length; i < itfcs[ 1 ]; i ++ ){
                                                                        this.__m_data.eth[ 1 ].multi.push({});
                                                                }
                                                                this.__m_data.eth[ 1 ].multi[ itfcs[ 1 ] - 1 ].gateway = add;
                                                        }else{
                                                                this.__m_data.eth[ 1 ].multi = [{gateway: add }];
                                                        }
                                                }else{
                                                        this.__m_data.eth[ 1 ].gateway = add;
                                                }
                                        break;
                                        }
                        }
                        /**
                         * @brief 解析配置文件
                         */
                        __parserFile( data )
                        {
                                let lines = [];
                                lines = data.split( '\n' );
                                this.__remove_comment(lines );   // 移除注释行
                                this.__parse( lines );
                        }
                        /**
                         * 执行解析操作
                         * @param {I} lines , 要解析的数据
                         */
                        __parse( lines )
                        {
                                let curr = this.__m_interface_status.start;
                                for( let l in lines ){
                                        let line = lines[ l ];
                                        if( line.length <= 0 ) continue;
                                        for( let s in curr ){  // 遍历状态机的当前状态节点关联的弧
                                                let m_rst = line.match( curr[ s ].reg );
                                                if( m_rst ){
                                                        curr[ s ].trig( line );         // 触发预置处理函数
                                                        curr = curr[ s ].dst;           // 状态变换
                                                        break;                          // 继续执行下一行数据
                                                }
                                        }
                                }
                        }
                        /**
                         * 转换本地回环配置文件
                         * @param {O} rst_str ， 转换结果
                         */
                        __convert_lo( rst_str )
                        {
                                rst_str += "auto lo\niface lo inet loopback\n\n";
                                return rst_str;
                        }
                        /**
                         * 转换Wifi配置表
                         * @param {O} rst_str 
                         */
                        __convert_wlan( rst_str )
                        {
                                for( let i in this.__m_data.wlan ){
                                        if( this.__m_data.wlan[ i ].add_type == 'static'){
                                                if(this.__m_data.wlan[ i ].multi ){
                                                        for( let j in this.__m_data.eth[ i ].multi ){
                                                                rst_str += "auto wlan" + this.__m_data.wlan[ i ].interface ;
                                                                if( j !="0") 
                                                                        rst_str += ":" + this.__m_data.wlan[ i ].multi[ j ].interface + "\n"
                                                                else rst_str += "\n";
                
                                                                rst_str += "iface wlan" + this.__m_data.wlan[ i ].interface ;
                
                                                                if( j != '0' ) 
                                                                        rst_str += ":" + this.__m_data.wlan[ i ].multi[ j ].interface + " ";
                                                                else rst_str += " ";
                                                                rst_str += this.__m_data.wlan[ i ].multi[ j ].family + " " + 
                                                                        this.__m_data.wlan[ i ].multi[ j ].add_type + "\n";
                                                                
                                                                rst_str += "address " + this.__m_data.wlan[ i ].multi[ j ].address + "\n" +
                                                                        "netmask " + this.__m_data.wlan[ i ].multi[ j ].mask + "\n" +
                                                                        "gateway " + this.__m_data.wlan[ i ].multi[ j ].gateway + "\n\n";
                                                        }
                                                }else{
                                                        rst_str += "auto wlan" + this.__m_data.wlan[ i ].interface + "\n"
                                                                + "iface wlan" + this.__m_data.wlan[ i ].interface + " " + 
                                                                this.__m_data.wlan[ i ].family + " " + 
                                                                this.__m_data.wlan[ i ].add_type + "\n";
                                                        /*
                                                        rst_str += "address " + this.__m_data.wlan[ i ].address + "\n" +
                                                                "netmask " + this.__m_data.wlan[ i ].mask + "\n" +
                                                                "gateway " + this.__m_data.wlan[ i ].gateway + "\n\n";
                                                                */
                                                }
                                        }else{
                                                rst_str += "auto wlan" + this.__m_data.wlan[ i ].interface + "\n"
                                                + "iface wlan" + this.__m_data.wlan[ i ].interface + " " + this.__m_data.wlan[ i ].family + " " + this.__m_data.wlan[ i ].add_type + "\n\n";
                                        }
                                }
                
                                return rst_str
                        }
                        /**
                         * 转换有线网配置表
                         * @param {I} rst_str 
                         */
                        __convert_eth( rst_str )
                        {
                                for( let i in this.__m_data.eth ){
                                        
                                        if( this.__m_data.eth[ i ].add_type == 'static'){
                                                rst_str += "auto eth" + this.__m_data.eth[ i ].interface + "\n"
                                                                + "iface eth" + this.__m_data.eth[ i ].interface + " " + 
                                                                this.__m_data.eth[ i ].family + " " + 
                                                                this.__m_data.eth[ i ].add_type + "\n";
                                                rst_str += "address " + this.__m_data.eth[ i ].address + "\n" +
                                                                "netmask " + this.__m_data.eth[ i ].mask + "\n" 
                                                let split = this.__m_data.eth[i].address.split('.')
                                                if(this.__m_data.eth[i].gateway != ''){
                                                        rst_str += "gateway " + this.__m_data.eth[ i ].gateway + "\n\n"
                                                } else if(split[0] < 128){
                                                        rst_str += "gateway " + split[0]+".1.1.1\n\n"
                                                } else if(127 < split[0] && split[0] < 192){
                                                        rst_str += "gateway " + split[0]+"."+split[1] + ".1.1\n\n"
                                                } else if(191 < split[0] && split[0] < 224){
                                                        rst_str += "gateway " + split[0]+"."+split[1]+"."+split[2] + ".1\n\n"
                                                }
                
                                                if(this.__m_data.eth[ i ].multi ){
                                                        for( let j in this.__m_data.eth[ i ].multi ){
                                                                rst_str += "auto eth" + this.__m_data.eth[ i ].interface ;      // auto ethX                                        
                                                                rst_str += ":" + this.__m_data.eth[ i ].multi[ j ].interface + "\n"
                                                                rst_str += "iface eth" + this.__m_data.eth[ i ].interface ;    // iface ehtX inet XXXX<dhcp | static>              
                                                                rst_str += ":" + this.__m_data.eth[ i ].multi[ j ].interface + " ";
                                                                
                                                                rst_str += this.__m_data.eth[ i ].multi[ j ].family + " " + 
                                                                        this.__m_data.eth[ i ].multi[ j ].add_type + "\n";
                                                                if( this.__m_data.eth[ i ].multi[ j ].add_type == 'static'){
                                                                        rst_str += "address " + this.__m_data.eth[ i ].multi[ j ].address + "\n" +
                                                                                "netmask " + this.__m_data.eth[ i ].multi[ j ].mask + "\n"
                                                                                // "gateway " + this.__m_data.eth[ i ].multi[ j ].gateway + "\n\n";
                                                                        let split2 = this.__m_data.eth[ i ].multi[ j ].address.split('.')
                                                                        if(this.__m_data.eth[i].multi[j].gateway != ''){
                                                                                rst_str += "gateway " + this.__m_data.eth[ i ].multi[j].gateway + "\n\n"
                                                                        } else if(split2[0] < 128){
                                                                                rst_str += "gateway " + split2[0]+".1.1.1\n\n"
                                                                        } else if(127 < split2[0] && split2[0] < 192){
                                                                                rst_str += "gateway " + split2[0]+"."+split2[1] + ".1.1\n\n"
                                                                        } else if(191 < split2[0] && split2[0] < 224){
                                                                                rst_str += "gateway " + split2[0]+"."+split2[1]+"."+split2[2] + ".1\n\n"
                                                                        }
                                                                }else{
                                                                        rst_str += "\n"
                                                                }
                                                        }
                                                }
                                                        
                                                
                                        }else{
                                                rst_str += "auto eth" + this.__m_data.eth[ i ].interface + "\n"
                                                + "iface eth" + this.__m_data.eth[ i ].interface + " " + this.__m_data.eth[ i ].family + " " + this.__m_data.eth[ i ].add_type + "\n\n";
                                        }
                                }
                
                                return rst_str;
                        }
                        __convert_misc( rst_str )
                        {
                                rst_str +="# Bluetooth networking\niface bnep0 inet dhcp\n"
                                return rst_str;
                        }
                
                        /**
                         * @brief 执行文件更新操作。
                         */
                        save()
                        {
                                let rst_str = '# /etc/network/interfaces -- configuration file for ifup(8), ifdown(8)\n# The loopback interface\n';
                                rst_str = this.__convert_lo( rst_str ) + "\n";
                                rst_str += '# Wireless interfaces\n'
                                //rst_str = this.__convert_wlan( rst_str ) + "\n";
                                //rst_str += "iface atml0 inet dhcp\n# Wired or wireless interfaces\n\n";
                                rst_str = this.__convert_eth( rst_str );
                                // rst_str = this.__convert_misc( rst_str );
                                let _data1 = FS.readFileSync('./etc/config.json');
                                let json = JSON.parse(_data1)
                                let path = json.interface
                                FS.writeFileSync( path , rst_str );
                                
                                return true;
                        }
                        /**
                         * 设置指定接口的配置。
                         * @param {I} itfc , 接口名称
                         * @param {I} config ，配置内容
                         */
                        __setInterface( itfc , config )
                        {
                                switch( itfc ){
                                case 'lo':
                                        this.__m_data.lo = config;
                                break;
                                case 'wlan0':
                                        this.__m_data.wlan = config;
                                break;
                                case 'eth0':
                                        this.__m_data.eth[ 0 ] = config;
                                break;
                                case 'eth1':
                                        this.__m_data.eth[ 1 ] = config;
                                break;
                                default:
                                        if( itfc.indexOf(':') != -1 ){ // 接口存在多网段配置
                                                this.__processCmplxItfc( itfc , config );
                                        }else{
                                                console.log("不支持对接口：" + itfc + "进行配置");
                                        }
                                }
                        }
                        /**
                         * 配置多网段的某一个网段的内容
                         * @param {I} obj ， 要配置网段的接口对象
                         * @param {I} idx ， 网段索引，如果该索引不存在则应该新增索引
                         * @param {I} config ， 配置表，配置表应该包含接口配置内容，和各个具体参数的配置内容。比如：
                         *      {
                         *              interface:"", family:"inet", add_type:"static",address:"", mask:""
                         *      }
                         *       在这种情况下，则原来外部的配置对象中的配置参数无效。生成配置文件的时候忽略外部参数，只参数外部的interface,比如对于外部
                         *       的eth的接口来说，外部interface=0 , 则接口是eth0, 当内部的interface=1的时候，综合起来就是eth0:1
                         */
                        __config_multi_add( obj , idx , varName , config )
                        {
                                if( !obj.multi ){
                                        obj.multi = [config ];
                                        return;
                                }
                
                                let isfind = false;
                                for( let i in obj.multi ){
                                        if( obj.multi[ i ].interface == idx ){
                                                this.__set_param( obj.multi[ i ], varName , config )
                                                isfind = true;
                                                break;
                                        }
                                }
                
                                if( isfind == false ){  // 如果没有给定的配置内容，则添加一个新的内容
                                        obj.multi.push( {} );
                                        this.__set_param( obj.multi[ obj.multi.length - 1 ] , varName , config );
                                }
                        }
                        /**
                         * 配置复杂名称的接口
                         * @param {I} itfc , 接口名称
                         * @param {I} config ，配置内容
                         */
                        __processCmplxItfc( itfc , varName , config )
                        {
                                let itfcs = itfc.split( ':' )
                                switch( itfcs[ 0 ]){
                                case 'lo': 
                                console.log( "不支持对回环地址进行多配" );
                                break;
                                case 'wlan0':
                                        this.__config_multi_add( this.__m_data.wlan[ 0 ] , itfcs[ 1 ] , varName , config );
                                break;
                                case 'eth0':
                                        this.__config_multi_add( this.__m_data.eth[ 0 ] , itfcs[ 1 ] , varName , config );
                                break;
                                case 'eth1':
                                        this.__config_multi_add( this.__m_data.eth[ 1 ] , itfcs[ 1 ] , varName , config );
                                break;   
                                }
                        }
                        /**
                         * 配置网络接口。不支持IPv6
                         * @param {I} itfc , 网络接口名称，应该包含完成接口名称，如果是多IP的静态文件配置。则应该按照明确格式进行命名
                         * @param {I} varName，变量名称，比如: address、netmask和gateway。当config是null的时候，是config的内容
                         * @param {I} config ,配置参数，参数应该是标准的字符串描述，
                         */
                        setInterface( itfc , varName , config )
                        {
                                if( config != null ){
                                        this.__setInterfaceParam( itfc , varName , config )
                                }else{
                                        this.__setInterface( itfc , varName );
                                }
                        }
                        /**
                         * 配置静态网络的参数
                         * @param {I} itfc 网络接口对象
                         * @param {I} varname 参数名称
                         * @param {I} config 参数值
                         */
                        __set_param( itfc , varname , config )
                        {
                                switch( varname ){
                                case "address":
                                        itfc.address = config;
                                break;
                                case "mask":
                                        itfc.mask = config;
                                break;
                                case "gateway":
                                        itfc.gateway = config;
                                break;
                                case "add_type":
                                        itfc.add_type = config;
                                        break;
                                case "dns":
                                        itfc.dns = config;
                                        break;
                                }
                        }
                        /**
                         * 配置接口参数
                         * @param {I} itfc 接口名称
                         * @param {I} varName 参数名称，比如address, gateway,mask
                         * @param {I} config 配置值
                         */
                        __setInterfaceParam( itfc , varName , config )
                        {
                                switch( itfc ){
                                case 'lo':
                                        this.__set_param( this.__m_data.lo , varName , config );
                                break;
                                case 'wlan0':
                                        this.__set_param( this.__m_data.wlan[ 0 ] , varName , config )
                                break;
                                case 'eth0':
                                        this.__set_param( this.__m_data.eth[ 0 ] , varName , config )
                                break;
                                case 'eth1':
                                        this.__set_param( this.__m_data.eth[ 1 ] , varName , config);
                                break;
                                default:
                                        if( itfc.indexOf(':') != -1 ){ // 接口存在多网段配置
                                                this.__processCmplxItfc( itfc , varName , config );
                                        }else{
                                                console.log("不支持对接口：" + itfc + "进行配置");
                                        }
                                }
                        }
                        /**
                         * 设置接口类型，主要是指设置接口地址是dhcp或者是static
                         * @param {I} itfc 接口名称，应该是标准的接口名称
                         * @param {I} type 
                         */
                        setIfaceType( itfc , type )
                        {
                                switch( itfc ){
                                case 'lo':
                                        this.__m_data.lo.interface = ""
                                        this.__m_data.lo.add_type = type;
                                break;
                                case 'wlan0':
                                        if( this.__m_data.wlan.length < 1 ) this.__m_data.wlan.push( {} )
                                        this.__m_data.wlan[ 0 ].add_type = type;
                                        this.__m_data.wlan[ 0 ].interface = "0"
                                        this.__m_data.wlan[ 0 ].family = "inet"
                                break;
                                case 'eth0':{
                                        if( this.__m_data.eth.length < 1 ){
                                                this.__m_data.eth.push({});
                                        }
                                        this.__m_data.eth[ 0 ].interface = "0"
                                        this.__m_data.eth[ 0 ].add_type = type;
                                        this.__m_data.eth[ 0 ].family = "inet";
                                }
                                break;
                                case 'eth1':
                                        for( var i = this.__m_data.eth.length; i < 2; i ++ ){
                                                this.__m_data.eth.push({});
                                        }
                                        this.__m_data.eth[ 1 ].interface = "1"
                                        this.__m_data.eth[ 1 ].add_type = type;
                                        this.__m_data.eth[ 1 ].family = "inet";
                                break;
                                default:
                                        this.__processCmplxItfcType( itfc , type );
                                }
                        }
                        /**
                         * 配置多网段的网络地址类型
                         * @param {I} obj 
                         * @param {I} idx 
                         * @param {I} type 
                         */
                        __config_multi_itfc_type( obj , idx , type )
                        {
                                if( !obj.multi ){
                                        obj.multi = [{interface:idx , family:"inet" ,add_type: type }];
                                        return;
                                }
                                let isfind = false;
                                for( let i in obj.multi ){
                                        if( obj.multi[ i ].interface == idx ){
                                                obj.multi[ i ].add_type = type;
                                                isfind = true;
                                                break;
                                        }
                                }
                
                                if( isfind == false ){
                                        obj.multi.push( {interface:idx , family:"inet" , add_type: type } );
                                }
                        }
                        /**
                         * 配置多IP地址的时候用这个配置地址类型
                         * @param {I} itfc ，接口名称
                         * @param {I} type ， 接口类型
                         */
                        __processCmplxItfcType( itfc , type )
                        {
                                let itfcs = itfc.split(':');
                
                                if( itfcs ){
                                        switch( itfcs[ 0 ]){
                                        case 'lo': 
                                                console.log( "不支持对回环地址进行多配" );
                                        break;
                                        case 'wlan0':
                                                this.__config_multi_itfc_type( this.__m_data.wlan[ 0 ] , itfcs[ 1 ] , type );
                                        break;
                                        case 'eth0':
                                                this.__config_multi_itfc_type( this.__m_data.eth[ 0 ] , itfcs[ 1 ] , type );
                                        break;
                                        case 'eth1':
                                                this.__config_multi_itfc_type( this.__m_data.eth[ 1 ] , itfcs[ 1 ] , type );
                                        break;   
                                        }
                                }
                        }
                        /**
                         * @brief 返回网络数据内容
                         */
                        data()
                        {
                                return this.__m_data;
                        }
                 };
                
                 module.exports = netInterface