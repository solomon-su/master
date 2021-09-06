/**
 * @brief FTP客户端模块，主要用来从VPN服务器下载授权文件。模块中包含了一个TCP客户端，和FTP客户端。
 *    TCP客户端主要和服务器进行协商，获取授权权限后在执行下载授权证书
 * @date 2020-9-20
 * @version 1.0
 * @author 宋炜
 */

const FTPC = require( 'basic-ftp' )
const TCP = require( 'net' );
const DNS = require( 'dns' )
const CRYPTO = require( 'crypto' )
const {exec} = require( 'child_process' )
const FS = require( 'fs' )

class ftpC
{
	constructor( devId , usr , pswd )
	{
		this.__m_ftp = new FTPC.Client( 10000 )

		this.__m_def_path = "./tmp/"                // 下载临时目录
		this.__m_ftp.ftp.verbose = true
		
		this.__m_user = usr;
		this.__m_pswd = pswd;
		this.__m_devId = devId;
		this.__m_port = 7878;
		this.__m_tcp = null;
		this.__m_fsm = {};                      // 状态机对象
		this.__m_fsm_recert = {};               // 重新授权状态机
		this.__m_fsm_reinstall = {};            // 重新安装授权证书状态机
		this.__m_current_status = null;         // 状态机的当前状态
		
		this.__m_resolver = new DNS.Resolver()
		this.__m_resolver.setServers( ['8.8.8.8'] );
		this.__rst_cb = null;                   // 回调通知函数
		this.__result = false;			// 操作结果


		this.__init_fsm();            // 初始化首次授权FSM
		this.__init_recert_fsm();     // 初始化重新授权FSM
		this.__init_reinstall_fsm();  // 初始化重新安装授权FSM
	}

	/**
	 * @brief 读取操作结果
	 */
	result()
	{
		return this.__result;
	}
	/**
	 * @brief 初始化状态转换状态机
	 */
	__init_fsm()
	{
		let obj = this;
		this.__m_fsm = {
			start:[  // 起始状态
				{
					name: "start",
					data:"run",
					auto: false,     // 如果auto为真，则自动触发
					dst:null,
					init:()=>{
						obj.__m_fsm.start[ 0 ].dst = obj.__m_fsm.tcp_connected;
					},
					trig: async ( cmd , data )=>{
						if( cmd == 'run'){
							try{
								console.log( "授权操作准备就绪，正在尝试连接服务器" );
								await obj.__init_tcp_client();
								obj.__m_current_status = obj.__m_fsm.start[ 0 ].dst;
								obj.__run_data( "login" );
							}catch( e ){
								obj.__m_current_status = obj.__m_fsm.start[ 0 ].dst;
								obj.__run_data( 'error' );
							}
						}else{

							console.log( "状态错误，不支持给定操作： " + cmd );
						}
					}
				},
				{
					name:"start",
					data:"error",
					dst: null,
					auto:true,
					init:()=>{
						obj.__m_fsm.start[ 1 ].dst = obj.__m_fsm.end;
					},
					trig: ( cmd , data )=>{
						console.log( "TCP 连接失败" );
					}
				}
			],
			end:[  // 结束状态
				{
					name: "end.",
					data:null,
					dst:null,
					auto:true,
					init:()=>{},
					trig:( cmd , data )=>{
						console.log( "结束状态" );
						if( obj.__rst_cb && typeof( obj.__rst_cb) == 'function' ){
							obj.__rst_cb( obj.__result );
						}
					}
				}
			],
			tcp_connected:[ // TCP连接成功
				{
					name:"connected",
					data:"error",
					dst:null,
					auto:false,
					init:()=>{
						obj.__m_fsm.tcp_connected[ 0 ].dst = obj.__m_fsm.end;
					},
					trig:( cmd , data )=>{
						obj.__m_current_status = obj.__m_fsm.tcp_connected[ 0 ].dst;
						console.log( "连接服务器失败: " + cmd );
					}
				},
				{
					name:"connected",
					data:"login",
					dst: null,
					auto: false,
					init:()=>{
						obj.__m_fsm.tcp_connected[ 1 ].dst = obj.__m_fsm.before_login;
					},
					trig:( cmd , data )=>{
						console.log( "与服务器已经建立连接， 尝试登陆服务器：" + cmd );
						obj.__login();
					}
				}
			],
			tcp_closed:[  // TCP 连接断开
				{
					name: "tcp_closed",
					data:null,
					dst:null,
					auto:true,
					init:()=>{
						obj.__m_fsm.tcp_closed[ 0 ].dst = obj.__m_fsm.end;
					},
					trig:( cmd , data )=>{
						console.log( "TCP 连接断开，操作结束" );
						obj.__run_auto();
					}
				}
			],
			before_login:[ // 登录请求发送完成
				{  // 通讯错误状态转换
					name: "before_login",
					dst: null,
					data: "error",
					auto: false,
					init:()=>{
						obj.__m_fsm.before_login[ 0 ].dst = obj.__m_fsm.end;
					},
					trig:( cmd , data )=>{
						console.log( "TCP连接意外断开。" );
					}
				},
				{ // 登录反馈允许
					name: "login" ,
					dst: null,
					data: "success",
					auto: false,
					init:()=>{
						obj.__m_fsm.before_login[ 1 ].dst = obj.__m_fsm.login;
					},
					trig:( cmd , data )=>{
						console.log( "设备登录成功" )
					}
				},
				{ // 登录拒绝反馈
					name: "login",
					dst: null,
					data: "fail",
					auto: false,
					init:()=>{
						obj.__m_fsm.before_login[ 2 ].dst = obj.__m_fsm.end;
					},
					trig:( cmd , data )=>{
						try{
							let json = JSON.parse( data.toString() );
							
							switch( json.code ){
								case -1:
									console.log( "用户账户不存在" );
									break;
								case -2:
									console.log( "用户密码错误" );
									break;
								case -3:
									console.log( "设备号错误" );
									break;
							}
							
						}catch( e ){
							console.log( e );
						}

						obj.close();
					}
				}
			],
			login:[  // 登录成功
				{  // 通讯错误状态转换
					name: "before_login",
					dst: null,
					data: null,
					auto: true,
					init:()=>{
						obj.__m_fsm.login[ 0 ].dst = obj.__m_fsm.req_cert;
					},
					trig:( cmd , data )=>{
						console.log( "授权请求已经发出等候服务器反馈，将在10s后超时" );
						obj.__setOvertime( 10000 );
						obj.__req_cert();    // 执行请求授权
					}
				},
				{
					name: "login",
					dst: null,
					data: "error",
					auto: false,
					init:()=>{
						obj.__m_fsm.login[ 1 ].dst = obj.__m_fsm.end;
					},
					trig:( cmd , data )=>{
						console.log( "发送授权请求失败: " + cmd );
					}
				}
			],
			req_cert:[
				{
					name:"req_cert",
					dst:null,
					data:"cert_overtime",
					init:()=>{
						obj.__m_fsm.req_cert[ 0 ].dst = obj.__m_fsm.end;
					},
					trig:( cmd , data )=>{
						console.log( "申请授权证书超时， 操作即将结束。" );						
					}
				},
				{
					name: "req_cert",
					dst: null,
					data: "error",
					auto: false,
					init:()=>{
						obj.__m_fsm.req_cert[ 1 ].dst = obj.__m_fsm.end;
					},
					trig:( cmd , data )=>{
						console.log( "发送授权请求失败 " + ( cmd  == null ? "" : ": " + cmd ) );
					}
				},
				{
					name: "req_cert",
					dst: null,
					data: "success",
					auto: false,
					init:()=>{
						obj.__m_fsm.req_cert[ 2 ].dst = obj.__m_fsm.resp_cert;
					},
					trig:( cmd , data )=>{
						console.log( "授权成功，准备下载授权文件" );
						clearTimeout( obj.__m_req_timer );
						let json = JSON.parse( data );
						obj.__store_cert_info( json );
					}
				},
				{
					name: "req_cert",
					dst: null,
					data: "fail",
					auto: false,
					init:()=>{
						obj.__m_fsm.req_cert[ 3 ].dst = obj.__m_fsm.resp_cert_fail;
					},
					trig:( cmd , data )=>{
						clearTimeout( obj.__m_req_timer );
						console.log( "授权失败，正在处理后续问题 " );
					}
				}
			],
			resp_cert:[
				{ // 处理成功反馈
					name:"resp_cert",
					data:null,
					dst: null,
					auto: true,
					init:()=>{
						obj.__m_fsm.resp_cert[ 0 ].dst = obj.__m_fsm.cert_acpt;
					},
					trig: async ( cmd , data )=>{
						try{
							let rst = await obj.__connect_ftp( obj.__m_nego_rst );
							if( rst == false ){
								obj.__run_data( "error" );
							}else{
								obj.__run_auto();
							}
						}catch( e ){
							obj.__run_data( "error" );
						}
					}
				},
				{  // 处理通讯错误
					name: "resp_cert",
					dst: null,
					auto: false,
					data:"error",
					init:()=>{
						obj.__m_fsm.resp_cert[ 1 ].dst = obj.__m_fsm.end;
					},
					trig:( cmd , data )=>{
						console.log( "通讯错误" );
					}
				}
				
			],
			resp_cert_fail:[
				{ // 处理反馈失败
					name:"resp_cert",
					data:"fail",
					dst: null,
					auto: false,
					init:()=>{
						obj.__m_fsm.resp_cert_fail[ 0 ].dst = obj.__m_fsm.cert_rej;
					},
					trig:( cmd , data )=>{
						try{
							console.log( "服务器拒绝连接：" );
							let json = JSON.parse( data.toString() );
							console.log( json );
						}catch( e ){
							console.log( "JSON格式错误，无法执行解析。" );
						}

						obj.__run_data( 'fail' );
					}
				}
			],
			cert_acpt:[
				{
					name: "cert_acpt",
					data: "downloading",
					dst: null,
					auto: true,
					init:()=>{
						obj.__m_fsm.cert_acpt[ 0 ].dst = obj.__m_fsm.downloading;
					},
					trig:( cmd , data )=>{
						console.log( "FTP服务器已经连接，开始下载文件" )
						obj.__download_file( obj.__m_nego_rst );
						//obj.__run_data("downloading");
					}
				}
			],
			cert_rej:[
				{
					name: "cert_rej",
					dst: null,
					auto: true,
					data: null,
					init:()=>{
						obj.__m_fsm.cert_rej[ 0 ].dst = obj.__m_fsm.end;
					},
					trig:( cmd , data )=>{
						console.log( data );
					}
				}
			],
			downloading:[
				{
					name:"downloading",
					dst:null,
					auto: false,
					data: "install",
					init:()=>{
						obj.__m_fsm.downloading[ 0 ].dst = obj.__m_fsm.install;
					},
					trig: async ( cmd , data )=>{
						console.log( "授权文件下载完成，开始安装文件" );
						
						obj.__install_cert();
						console.log( "FTP授权完成" );
						obj.__m_current_status = obj.__m_fsm.downloading[ 0 ].dst;
						obj.__run_data( 'finish' );
					}
				},
				{
					name: "downloading",
					data:"error",
					dst:null,
					auto: false,
					init:()=>{
						obj.__m_fsm.downloading[ 1 ].dst = obj.__m_fsm.end;
					},
					trig:( cmd , data )=>{
						obj.__run_data( 'error' )
					}
				}
			],
			install:[
				{
					name:"install",
					dst:null,
					data:"finish",
					auto:false,
					init:()=>{
						obj.__m_fsm.install[ 0 ].dst = obj.__m_fsm.end;
					},
					trig:( cmd , data )=>{
						obj.__rst_cb( {STATUS:'SUCCESS'} )
					}
				}
			]
		}
		// 初始化状态机弧目标指向
		for( let i in this.__m_fsm ){
			for( let j in this.__m_fsm[ i ]){
				this.__m_fsm[ i ][ j ].init();
			}
		}
	}
	/**
	 * @brief 登录确认身份，然后请求下载证书执行安装。
	 */
	__init_reinstall_fsm()
	{
		let obj = this;
		this.__m_fsm_reinstall = {
			start:[  // 起始状态
				{
					name: "start",
					data:"run",
					auto: false,     // 如果auto为真，则自动触发
					dst:null,
					init:()=>{
						obj.__m_fsm_reinstall.start[ 0 ].dst = obj.__m_fsm_reinstall.tcp_connected;
					},
					trig: async ( cmd , data )=>{
						if( cmd == 'run'){
							try{
								console.log( "授权操作准备就绪，正在尝试连接服务器" );
								await obj.__init_tcp_client();
								obj.__m_current_status = obj.__m_fsm_reinstall.start[ 0 ].dst;
								obj.__run_data( "login" );
							}catch( e ){
								obj.__m_current_status = obj.__m_fsm_reinstall.start[ 0 ].dst;
								obj.__run_data( 'error' );
							}
						}else{

							console.log( "状态错误，不支持给定操作： " + cmd );
						}
					}
				},
				{
					name:"start",
					data:"error",
					dst: null,
					auto:true,
					init:()=>{
						obj.__m_fsm_reinstall.start[ 1 ].dst = obj.__m_fsm_reinstall.end;
					},
					trig: ( cmd , data )=>{
						console.log( "TCP 连接失败" );
					}
				}
			],
			end:[  // 结束状态
				{
					name: "end.",
					data:null,
					dst:null,
					auto:true,
					init:()=>{},
					trig:( cmd , data )=>{
						console.log( "结束状态" );
						if( obj.__rst_cb && typeof( obj.__rst_cb) == 'function' ){
							obj.__rst_cb( obj.__result );
						}
					}
				}
			],
			tcp_connected:[ // TCP连接成功
				{
					name:"connected",
					data:"error",
					dst:null,
					auto:false,
					init:()=>{
						obj.__m_fsm_reinstall.tcp_connected[ 0 ].dst = obj.__m_fsm_reinstall.end;
					},
					trig:( cmd , data )=>{
						obj.__m_current_status = obj.__m_fsm_reinstall.tcp_connected[ 0 ].dst;
						console.log( "连接服务器失败: " + cmd );
					}
				},
				{
					name:"connected",
					data:"login",
					dst: null,
					auto: false,
					init:()=>{
						obj.__m_fsm_reinstall.tcp_connected[ 1 ].dst = obj.__m_fsm_reinstall.before_login;
					},
					trig:( cmd , data )=>{
						console.log( "与服务器已经建立连接， 尝试登陆服务器：" + cmd );
						obj.__login();
					}
				}
			],
			tcp_closed:[  // TCP 连接断开
				{
					name: "tcp_closed",
					data:null,
					dst:null,
					auto:true,
					init:()=>{
						obj.__m_fsm_reinstall.tcp_closed[ 0 ].dst = obj.__m_fsm_reinstall.end;
					},
					trig:( cmd , data )=>{
						console.log( "TCP 连接断开，操作结束" );
						obj.__run_auto();
					}
				}
			],
			before_login:[ // 登录请求发送完成
				{  // 通讯错误状态转换
					name: "before_login",
					dst: null,
					data: "error",
					auto: false,
					init:()=>{
						obj.__m_fsm_reinstall.before_login[ 0 ].dst = obj.__m_fsm_reinstall.end;
					},
					trig:( cmd , data )=>{
						console.log( "TCP连接意外断开。" );
					}
				},
				{ // 登录反馈允许
					name: "login" ,
					dst: null,
					data: "success",
					auto: false,
					init:()=>{
						obj.__m_fsm_reinstall.before_login[ 1 ].dst = obj.__m_fsm_reinstall.login;
					},
					trig:( cmd , data )=>{
						console.log( "设备登录成功" )
					}
				},
				{ // 登录拒绝反馈
					name: "login",
					dst: null,
					data: "fail",
					auto: false,
					init:()=>{
						obj.__m_fsm_reinstall.before_login[ 2 ].dst = obj.__m_fsm_reinstall.end;
					},
					trig:( cmd , data )=>{
						try{
							let json = JSON.parse( data.toString() );
							
							switch( json.code ){
								case -1:
									console.log( "用户账户不存在" );
									break;
								case -2:
									console.log( "用户密码错误" );
									break;
								case -3:
									console.log( "设备号错误" );
									break;
							}
							
						}catch( e ){
							console.log( e );
						}

						obj.close();
					}
				}
			],
			login:[  // 登录成功
				{  // 通讯错误状态转换
					name: "before_login",
					dst: null,
					data: null,
					auto: true,
					init:()=>{
						obj.__m_fsm_reinstall.login[ 0 ].dst = obj.__m_fsm_reinstall.req_cert;
					},
					trig:( cmd , data )=>{
						console.log( "授权请求已经发出等候服务器反馈，将在10s后超时" );
						obj.__setOvertime( 10000 );
						obj.__req_cert();    // 执行请求授权
					}
				},
				{
					name: "login",
					dst: null,
					data: "error",
					auto: false,
					init:()=>{
						obj.__m_fsm_reinstall.login[ 1 ].dst = obj.__m_fsm_reinstall.end;
					},
					trig:( cmd , data )=>{
						console.log( "发送授权请求失败: " + cmd );
					}
				}
			],
			req_cert:[
				{
					name:"req_cert",
					dst:null,
					data:"cert_overtime",
					init:()=>{
						obj.__m_fsm_reinstall.req_cert[ 0 ].dst = obj.__m_fsm_reinstall.end;
					},
					trig:( cmd , data )=>{
						console.log( "申请授权证书超时， 操作即将结束。" );						
					}
				},
				{
					name: "req_cert",
					dst: null,
					data: "error",
					auto: false,
					init:()=>{
						obj.__m_fsm_reinstall.req_cert[ 1 ].dst = obj.__m_fsm_reinstall.end;
					},
					trig:( cmd , data )=>{
						console.log( "发送授权请求失败 " + ( cmd  == null ? "" : ": " + cmd ) );
					}
				},
				{
					name: "req_cert",
					dst: null,
					data: "success",
					auto: false,
					init:()=>{
						obj.__m_fsm_reinstall.req_cert[ 2 ].dst = obj.__m_fsm_reinstall.resp_cert;
					},
					trig:( cmd , data )=>{
						console.log( "授权成功，准备下载授权文件" );
						clearTimeout( obj.__m_req_timer );
						let json = JSON.parse( data );
						obj.__store_cert_info( json );
					}
				},
				{
					name: "req_cert",
					dst: null,
					data: "fail",
					auto: false,
					init:()=>{
						obj.__m_fsm_reinstall.req_cert[ 3 ].dst = obj.__m_fsm_reinstall.resp_cert_fail;
					},
					trig:( cmd , data )=>{
						clearTimeout( obj.__m_req_timer );
						console.log( "授权失败，正在处理后续问题 " );
					}
				}
			],
			resp_cert:[
				{ // 处理成功反馈
					name:"resp_cert",
					data:null,
					dst: null,
					auto: true,
					init:()=>{
						obj.__m_fsm_reinstall.resp_cert[ 0 ].dst = obj.__m_fsm_reinstall.cert_acpt;
					},
					trig: async ( cmd , data )=>{
						try{
							let rst = await obj.__connect_ftp( obj.__m_nego_rst );
							if( rst == false ){
								obj.__run_data( "error" );
							}else{
								obj.__run_auto();
							}
						}catch( e ){
							obj.__run_data( "error" );
						}
					}
				},
				{  // 处理通讯错误
					name: "resp_cert",
					dst: null,
					auto: false,
					data:"error",
					init:()=>{
						obj.__m_fsm_reinstall.resp_cert[ 1 ].dst = obj.__m_fsm_reinstall.end;
					},
					trig:( cmd , data )=>{
						console.log( "通讯错误" );
					}
				}
				
			],
			resp_cert_fail:[
				{ // 处理反馈失败
					name:"resp_cert",
					data:"fail",
					dst: null,
					auto: false,
					init:()=>{
						obj.__m_fsm_reinstall.resp_cert_fail[ 0 ].dst = obj.__m_fsm_reinstall.cert_rej;
					},
					trig:( cmd , data )=>{
						try{
							console.log( "服务器拒绝连接：" );
							let json = JSON.parse( data.toString() );
							console.log( json );
						}catch( e ){
							console.log( "JSON格式错误，无法执行解析。" );
						}

						obj.__run_data( 'fail' );
					}
				}
			],
			cert_acpt:[
				{
					name: "cert_acpt",
					data: null,
					dst: null,
					auto: true,
					init:()=>{
						obj.__m_fsm_reinstall.cert_acpt[ 0 ].dst = obj.__m_fsm_reinstall.downloading;
					},
					trig:( cmd , data )=>{
						console.log( "FTP服务器已经连接，开始下载文件" )
						obj.__download_file( obj.__m_nego_rst );
					}
				}
			],
			cert_rej:[
				{
					name: "cert_rej",
					dst: null,
					auto: true,
					data: null,
					init:()=>{
						obj.__m_fsm_reinstall.cert_rej[ 0 ].dst = obj.__m_fsm_reinstall.end;
					},
					trig:( cmd , data )=>{
						console.log( data );
					}
				}
			],
			downloading:[
				{
					name:"downloading",
					dst:null,
					auto: false,
					data: "install",
					init:()=>{
						obj.__m_fsm_reinstall.downloading[ 0 ].dst = obj.__m_fsm_reinstall.install;
					},
					trig: async ( cmd , data )=>{
						console.log( "授权文件下载完成，开始分析文件有效性......" );
						let rst = obj.__check_file();
						if( rst == true ){
							obj.__run_data( "install" );
						}else{
							console.log( "文件检查失败，所下载的文件无效" );
							obj.__run_data( 'error' );
						}
					}
				},
				{
					name: "downloading",
					data:"error",
					dst:null,
					auto: false,
					init:()=>{
						obj.__m_fsm_reinstall.downloading[ 1 ].dst = obj.__m_fsm_reinstall.end;
					},
					trig:( cmd , data )=>{
						obj.__run_data( 'error' )
					}
				}
			],
			install:[
				{
					name:"install",
					dst:null,
					data:"finish",
					auto:false,
					init:()=>{
						obj.__m_fsm_reinstall.install[ 0 ].dst = obj.__m_fsm_reinstall.end;
					},
					trig:( cmd , data )=>{
						obj.__install_cert();
						console.log( "FTP授权完成" );
						obj.__run_data( 'finish' )
					}
				}
			]
		}
		// 初始化状态机弧目标指向
		for( let i in this.__m_fsm_reinstall ){
			for( let j in this.__m_fsm_reinstall[ i ]){
				this.__m_fsm_reinstall[ i ][ j ].init();
			}
		}
	}
	/**
	 * @brief 初始化重新授权FSM
	 */
	__init_recert_fsm()
	{
		let obj = this;
		this.__m_fsm_recert = {
			start:[  // 起始状态
				{
					name: "start",
					data:"run",
					auto: false,     // 如果auto为真，则自动触发
					dst:null,
					init:()=>{
						obj.__m_fsm_recert.start[ 0 ].dst = obj.__m_fsm_recert.tcp_connected;
					},
					trig: async ( cmd , data )=>{
						if( cmd == 'run'){
							try{
								console.log( "授权操作准备就绪，正在尝试连接服务器" );
								await obj.__init_tcp_client();
								obj.__m_current_status = obj.__m_fsm_recert.start[ 0 ].dst;
								obj.__run_data( "login" );
							}catch( e ){
								obj.__m_current_status = obj.__m_fsm_recert.start[ 0 ].dst;
								obj.__run_data( 'error' );
							}
						}else{

							console.log( "状态错误，不支持给定操作： " + cmd );
						}
					}
				},
				{
					name:"start",
					data:"error",
					dst: null,
					auto:true,
					init:()=>{
						obj.__m_fsm_recert.start[ 1 ].dst = obj.__m_fsm_recert.end;
					},
					trig: ( cmd , data )=>{
						console.log( "TCP 连接失败" );
					}
				}
			],
			end:[  // 结束状态
				{
					name: "end.",
					data:null,
					dst:null,
					auto:true,
					init:()=>{},
					trig:( cmd , data )=>{
						console.log( "结束状态" );
						if( obj.__rst_cb && typeof( obj.__rst_cb) == 'function' ){
							obj.__rst_cb( obj.__result );
						}
					}
				}
			],
			tcp_connected:[ // TCP连接成功
				{
					name:"connected",
					data:"error",
					dst:null,
					auto:false,
					init:()=>{
						obj.__m_fsm_recert.tcp_connected[ 0 ].dst = obj.__m_fsm_recert.end;
					},
					trig:( cmd , data )=>{
						obj.__m_current_status = obj.__m_fsm_recert.tcp_connected[ 0 ].dst;
						console.log( "连接服务器失败: " + cmd );
					}
				},
				{
					name:"connected",
					data:"login",
					dst: null,
					auto: false,
					init:()=>{
						obj.__m_fsm_recert.tcp_connected[ 1 ].dst = obj.__m_fsm_recert.before_login;
					},
					trig:( cmd , data )=>{
						console.log( "与服务器已经建立连接， 尝试登陆服务器：" + cmd );
						obj.__login();
					}
				}
			],
			tcp_closed:[  // TCP 连接断开
				{
					name: "tcp_closed",
					data:null,
					dst:null,
					auto:true,
					init:()=>{
						obj.__m_fsm_recert.tcp_closed[ 0 ].dst = obj.__m_fsm_recert.end;
					},
					trig:( cmd , data )=>{
						console.log( "TCP 连接断开，操作结束" );
						obj.__run_auto();
					}
				}
			],
			before_login:[ // 登录请求发送完成
				{  // 通讯错误状态转换
					name: "before_login",
					dst: null,
					data: "error",
					auto: false,
					init:()=>{
						obj.__m_fsm_recert.before_login[ 0 ].dst = obj.__m_fsm_recert.end;
					},
					trig:( cmd , data )=>{
						console.log( "TCP连接意外断开。" );
					}
				},
				{ // 登录反馈允许
					name: "login" ,
					dst: null,
					data: "success",
					auto: false,
					init:()=>{
						obj.__m_fsm_recert.before_login[ 1 ].dst = obj.__m_fsm_recert.login;
					},
					trig:( cmd , data )=>{
						console.log( "设备登录成功" )
					}
				},
				{ // 登录拒绝反馈
					name: "login",
					dst: null,
					data: "fail",
					auto: false,
					init:()=>{
						obj.__m_fsm_recert.before_login[ 2 ].dst = obj.__m_fsm_recert.end;
					},
					trig:( cmd , data )=>{
						try{
							let json = JSON.parse( data.toString() );
							
							switch( json.code ){
								case -1:
									console.log( "用户账户不存在" );
									break;
								case -2:
									console.log( "用户密码错误" );
									break;
								case -3:
									console.log( "设备号错误" );
									break;
							}
							
						}catch( e ){
							console.log( e );
						}

						obj.close();
					}
				}
			],
			login:[  // 登录成功
				{  // 通讯错误状态转换
					name: "before_login",
					dst: null,
					data: null,
					auto: true,
					init:()=>{
						obj.__m_fsm_recert.login[ 0 ].dst = obj.__m_fsm_recert.req_cert;
					},
					trig:( cmd , data )=>{
						console.log( "授权请求已经发出等候服务器反馈，将在10s后超时" );
						obj.__setOvertime( 10000 );
						obj.__req_recert();    // 执行请求授权
					}
				},
				{
					name: "login",
					dst: null,
					data: "error",
					auto: false,
					init:()=>{
						obj.__m_fsm_recert.login[ 1 ].dst = obj.__m_fsm_recert.end;
					},
					trig:( cmd , data )=>{
						console.log( "发送授权请求失败: " + cmd );
					}
				}
			],
			req_cert:[
				{
					name:"req_cert",
					dst:null,
					data:"cert_overtime",
					init:()=>{
						obj.__m_fsm_recert.req_cert[ 0 ].dst = obj.__m_fsm_recert.end;
					},
					trig:( cmd , data )=>{
						console.log( "申请授权证书超时， 操作即将结束。" );						
					}
				},
				{
					name: "req_cert",
					dst: null,
					data: "error",
					auto: false,
					init:()=>{
						obj.__m_fsm_recert.req_cert[ 1 ].dst = obj.__m_fsm_recert.end;
					},
					trig:( cmd , data )=>{
						console.log( "发送授权请求失败 " + ( cmd  == null ? "" : ": " + cmd ) );
					}
				},
				{
					name: "req_cert",
					dst: null,
					data: "success",
					auto: false,
					init:()=>{
						obj.__m_fsm_recert.req_cert[ 2 ].dst = obj.__m_fsm_recert.resp_cert;
					},
					trig:( cmd , data )=>{
						console.log( "授权成功，准备下载授权文件" );
						clearTimeout( obj.__m_req_timer );
						let json = JSON.parse( data );
						obj.__store_cert_info( json );
					}
				},
				{
					name: "req_cert",
					dst: null,
					data: "fail",
					auto: false,
					init:()=>{
						obj.__m_fsm_recert.req_cert[ 3 ].dst = obj.__m_fsm_recert.resp_cert_fail;
					},
					trig:( cmd , data )=>{
						clearTimeout( obj.__m_req_timer );
						console.log( "授权失败，正在处理后续问题 " );
					}
				}
			],
			resp_cert:[
				{ // 处理成功反馈
					name:"resp_cert",
					data:null,
					dst: null,
					auto: true,
					init:()=>{
						obj.__m_fsm_recert.resp_cert[ 0 ].dst = obj.__m_fsm_recert.cert_acpt;
					},
					trig: async ( cmd , data )=>{
						try{
							let rst = await obj.__connect_ftp( obj.__m_nego_rst );
							if( rst == false ){
								obj.__run_data( "error" );
							}else{
								obj.__run_auto();
							}
						}catch( e ){
							obj.__run_data( "error" );
						}
					}
				},
				{  // 处理通讯错误
					name: "resp_cert",
					dst: null,
					auto: false,
					data:"error",
					init:()=>{
						obj.__m_fsm_recert.resp_cert[ 1 ].dst = obj.__m_fsm_recert.end;
					},
					trig:( cmd , data )=>{
						console.log( "通讯错误" );
					}
				}
				
			],
			resp_cert_fail:[
				{ // 处理反馈失败
					name:"resp_cert",
					data:"fail",
					dst: null,
					auto: false,
					init:()=>{
						obj.__m_fsm_recert.resp_cert_fail[ 0 ].dst = obj.__m_fsm_recert.cert_rej;
					},
					trig:( cmd , data )=>{
						try{
							console.log( "服务器拒绝连接：" );
							let json = JSON.parse( data.toString() );
							console.log( json );
						}catch( e ){
							console.log( "JSON格式错误，无法执行解析。" );
						}

						obj.__run_data( 'fail' );
					}
				}
			],
			cert_acpt:[
				{
					name: "cert_acpt",
					data: null,
					dst: null,
					auto: true,
					init:()=>{
						obj.__m_fsm_recert.cert_acpt[ 0 ].dst = obj.__m_fsm_recert.downloading;
					},
					trig:( cmd , data )=>{
						console.log( "FTP服务器已经连接，开始下载文件" )
						obj.__download_file( obj.__m_nego_rst );
					}
				}
			],
			cert_rej:[
				{
					name: "cert_rej",
					dst: null,
					auto: true,
					data: null,
					init:()=>{
						obj.__m_fsm_recert.cert_rej[ 0 ].dst = obj.__m_fsm_recert.end;
					},
					trig:( cmd , data )=>{
						console.log( data );
					}
				}
			],
			downloading:[
				{
					name:"downloading",
					dst:null,
					auto: false,
					data: "install",
					init:()=>{
						obj.__m_fsm_recert.downloading[ 0 ].dst = obj.__m_fsm_recert.install;
					},
					trig: async ( cmd , data )=>{
						console.log( "授权文件下载完成，开始分析文件有效性......" );
						let rst = obj.__check_file();
						if( rst == true ){
							obj.__run_data( "install" );
						}else{
							console.log( "文件检查失败，所下载的文件无效" );
							obj.__run_data( 'error' );
						}
					}
				},
				{
					name: "downloading",
					data:"error",
					dst:null,
					auto: false,
					init:()=>{
						obj.__m_fsm_recert.downloading[ 1 ].dst = obj.__m_fsm_recert.end;
					},
					trig:( cmd , data )=>{
						obj.__run_data( 'error' )
					}
				}
			],
			install:[
				{
					name:"install",
					dst:null,
					data:"finish",
					auto:false,
					init:()=>{
						obj.__m_fsm_recert.install[ 0 ].dst = obj.__m_fsm_recert.end;
					},
					trig:( cmd , data )=>{
						obj.__install_cert();
						console.log( "FTP授权完成" );
						obj.__run_data( 'finish' )
					}
				}
			]
		}
		// 初始化状态机弧目标指向
		for( let i in this.__m_fsm_recert ){
			for( let j in this.__m_fsm_recert[ i ]){
				this.__m_fsm_recert[ i ][ j ].init();
			}
		}
	}
	/**
	 * @brief 执行更新授权请求。这主要用于授权到期后的再次申请。这行这个操作后会吊销旧的授权证书，签发新的证书
	 *    在服务器端，吊销旧的证书后会将旧的证书归档保存
	 */
	__req_recert()
	{

	}
	/**
	 * @brief 执行系统指令
	 * @param {I} cmd 要执行的命令
	 */
	__exec_cmd( cmd )
	{
		let EXEC = exec;
		console.log( cmd );
		return new Promise( (res )=>{
			EXEC( cmd ,{ cwd: "/opt/httpSvr" , shell:"/bin/bash" } , ( err , stdout , stderr )=>{
				if( err ){
					console.log( stderr );
					res( false );
				}
				console.log( stdout );
				res( true )
			});
		})
	}
	/**
	 * @brief 安装证书，修改客户端配置文件。
	 */
	async __install_cert()
	{
		await this.__exec_cmd( "mv " + this.__m_def_path + "ca.crt /etc/openvpn" );
		await this.__exec_cmd( "mv " + this.__m_def_path + "ta.key /etc/openvpn" );
		await this.__exec_cmd( "mv " + this.__m_def_path + "*.crt /etc/openvpn/client.crt" );
		await this.__exec_cmd( "mv " + this.__m_def_path + "*.key /etc/openvpn/client.key" );
		await this.__exec_cmd( "mv ./etc/*.ovpn /etc/openvpn" )
	}
	/**
	 * 发出授权请求后，启动计时器。当及时完成时还没有返回数据，则触发授权超时
	 * @param {I} time 
	 */
	__setOvertime( time )
	{
		this.__m_req_timer = setTimeout( ()=>{
			this.__run_data( "cert_overtime" );
		} , time );
	}
	/**
	 * 保存协商结果。用来指导文件下载和文件校验
	 * @param {I} data 协商的结果数据
	 */
	__store_cert_info( data )
	{
		this.__m_nego_rst = data;
	}
	/**
	 * 计算文件的MD5摘要数据
	 * @param {I} file 要计算的文件完整路径
	 * @param {I} cb 计算结果通知回调函数
	 */
	__file_md5( file , cb )
	{
		if( cb && typeof( cb ) != 'function' ){
			console.log( "must has a callback function." );
			return;
		}

		let md5 = CRYPTO.createHash('md5');
		FS.open( file , 'r' , (err , fd )=>{
			if( err ){
				console.log( err );
				cb( "" );
				return;
			}
			let buf = Buffer.alloc( 1024 * 500 );
			let finish = false;
			while( !finish ){
				FS.read( fd , buf , 0, 50 * 1024 , ( err , len , buff )=>{
					if( err ){
						cb( "" );
						console.log( e );
						return;
					}else{
						md5.update( buff );
						if( len < 50 * 1024 ){
							cb( md5.digest('hex') );
							finish = true;
						}
					}
					
				})
			}
		})
		
	}
	/**
	 * @brief 检查文件的完整性。对下载的文件进行摘要计算，和进行授权请求获得摘要进行比较。
	 */
	__check_file()
	{
		let obj = this;
		return new Promise( ( res , rej )=>{
			for( let i in obj.__m_nego_rst.files[ i ] ){
				let file = this.__m_nego_rst.path;
				if( file[ file.length - 1 ] != "/" ){
					file = file + "/" + this.__m_nego_rst.files[ i ].file;
				}else{
					file = file + this.__m_nego_rst.files[ i ].file;
				}

				let md5 = obj.__m_nego_rst.files[ i ].md5;

				obj.__file_md5( file , ( f_md5 )=>{
					if( md5 != f_md5 ){
						console.log( "check file: " + file + " ... [ FAIL ]." )
						rej( false );
					}else{
						console.log( "check file: " + file + " ... [ OK ]." )
					}
				})
			}

			res( true );
		})
	}
	/**
	 * @brief 执行请求授权
	 */
	__req_cert()
	{
		let cmd = { 
			opt: "req_cert" , 
			type: "dev", 
			devId: this.__m_devId
		}

		this.__m_tcp.write( JSON.stringify( cmd ))
	}
	/**
	 * @brief 生成随机数
	 */
	__random()
	{
		let Range = 65535;   
		let Rand = Math.random();   
		return( Math.round(Rand * Range) );   
	}
	/**
	 * @brief 构造登录密码。算法如下：
	 *     1  使用用户密码 + salt，生成一个
	 * @param {I} obj 
	 */
	__makeLoginPswd( obj )
	{	
		let __obj = this;
		return new Promise( ( res , rej )=>{
			try{
				const algorithm = 'aes-192-cbc';
				const password = 'rockTechVPN'; 
		
				const key = CRYPTO.scryptSync(password, obj.salt , 24);
				const iv = CRYPTO.randomBytes( 24 );
				const cipher = CRYPTO.createCipheriv(algorithm, key, iv );
		
				let encrypted = '';

				cipher.on('readable', () => {
					let chunk;
					while (null !== (chunk = cipher.read())) {
						encrypted += chunk.toString('hex');
					}
				});

				cipher.on('end', () => {
					res( encrypted );
				});
		
				cipher.write( __obj.__m_pswd );
				cipher.end();
			}catch( e ){
				rej( e );
			}
		})
	}
	/**
	 * @brief 发送登录请求。如果发送
	 */
	async __login()
	{
		let req_cmd = {
			opt:"login",
			user: this.__m_user,
			salt: "" , //this.__random() + "",
			pswd: this.__m_pswd,
			devId: this.__m_devId,
		};
		try{
			req_cmd.pswd = this.__m_pswd;//await this.__makeLoginPswd( req_cmd );
		}catch( e ){
			console.log( e );
			return;
		}

		this.__m_tcp.write( JSON.stringify( req_cmd ),);
	}
	/**
	 * 执行TCP连接操作
	 * @param {I} address 目标地址数组，这个数组是域名解析的结果，所有可能有多个不同的地址
	 * @param {I} idx 当前的连接目标索引
	 * @param {I} res promise的resolve
	 * @param {I} rej promise的reject
	 */
	__do_connect( address , idx , res , rej )
	{
		this.__m_tcp = TCP.createConnection( this.__m_port , address[ idx ].address , ( )=>{
			console.log( "remote address: " + address[ idx ].address + " connected" );
			res( "connected" );
		})

		this.__m_tcp.on( 'error' , ( err )=>{
			console.log( "通讯错误：" + err );
			if( err.code == 'ECONNREFUSED'){ // 当连接失败后检查是否还存在没有尝试过的目标，如果有则尝试连接。如果没有则确定连接失败
				if( idx + 1< address.length ){
					this.__do_connect( address , i + 1 );
				}else{
					console.log( "Can not connect to server, pls check you server address or dns name." );
				}
			}else{
				obj.__run_data( "error" );
				rej( "error" )   // 没有连接成功目标
			}
		} )

		this.__m_tcp.on( "data" , ( data )=>{
			try{
				data = data.toString();
				let json = JSON.parse( data );
				this.__run_data( json.status , data );
			}catch( e ){
				console.log( e );
				this.__run_data( "error" )
			}
		})

		this.__m_tcp.on( "close" , ()=>{
			console.log( "链接已断开" );
			this.__m_tcp = null;
		})
	}
	/**
	 * @brief 初始化TCP连接。
	 */
	__init_tcp_client( )
	{
		let obj = this;
		return new Promise( (res , rej )=>{ 
			obj.__m_resolver.resolve( "dmp.rockemb.net" , "ANY" , ( err , records )=>{
				if( err ){
					console.log( err );
					rej( err );
				}else{
					if( obj.__m_tcp ){
						obj.__m_tcp.end();
						obj.__m_tcp = null;
					}

					obj.__do_connect( records , 0 , res , rej );
				}
			})
		})
	}
	/**
	 * 连接服务器，同时进行若干初始化操作。
	 * @param {I} url ， 服务器地址
	 * @param {I} port ， 服务器监听的端口
	 * @param {I} usr ， 用户名
	 * @param {I} pswd ， 账户密码
	 */
	async __connect_ftp( data )
	{
		try{
			let obj = this;
			let rst = await this.__m_ftp.access({
				host: "dmp.rockemb.net",
				port: 21,
				secure: false,
				user: obj.__m_user,
				password: obj.__m_pswd
			});
			console.log( rst.code + " " + rst.message );

			rst = await this.__m_ftp.send( "TYPE I" );
			console.log( rst.code + " " + rst.message );
			return true;
		}catch( e ){
			console.log( "连接VPN服务器失败：\n" + e );
		}

		return false;
	}
	/**
	 * @brief 驱动状态机执行自动状态转换的操作。
	 */
	__run_auto()
	{
		for( let i in this.__m_current_status ){
			if( this.__m_current_status[ i ].auto == true ){
				this.__m_current_status[ i ].trig();
				this.__m_current_status = this.__m_current_status[ i ].dst;
				break;
			}
		}
	}
	/**
	 * 使用数据触发状态机转换状态。
	 * @param {I} data ， 触发数据
	 */
	__run_data( cmd , data )
	{
		//console.log( data )
		for( let i in this.__m_current_status ){
			if( this.__m_current_status[ i ].data == cmd ){
				this.__m_current_status[ i ].trig( cmd, data );
				this.__m_current_status = this.__m_current_status[ i ].dst;
				this.__run_auto();
				break;
			}
		}
	}
	/**
	 * @brief 启动状态机
	 */
	run( cb )
	{
		this.__rst_cb = cb;

		this.__m_current_status = this.__m_fsm.start;
		this.__run_data( 'run' );
	}
	/**
	 * @brief 关闭连接。
	 */
	close()
	{
		if( this.__m_tcp ){  // 断开链接
			this.__m_tcp.end();
			this.__m_tcp = null;
		}
		if( this.__m_ftp ){
			this.__m_ftp.close();
			this.__m_ftp.end();
		}
	}
	/**
	 * @brief 执行文件下载
	 */
	async __download_file()
	{
		if( this.__m_ftp ){
			for( let i in this.__m_nego_rst.files ){
				let file = this.__m_nego_rst.path;
				if( file[ file.length - 1 ] != "/" ){
					file = file + "/" + this.__m_nego_rst.files[ i ].file;
				}else{
					file = file + this.__m_nego_rst.files[ i ].file;
				}
				
				await this.__m_ftp.downloadTo( this.__m_def_path + this.__m_nego_rst.files[ i ].file , file );
				
			}
			this.__run_data( "install" );
		}else{
			this.__run_data( 'error' )
		}
	}
}

module.exports = ftpC;
