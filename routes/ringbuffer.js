/**
 * @brief 数据环形缓冲区
 * @version 1.0
 * @author 宋炜
 * @date 2020-9-21
 */

class ringBuffer
{
        constructor( size )
        {
                this.__m_buffer = Buffer.alloc( size );
                this.__m_length = size;
                this.__m_size = 0;
                this.__m_append_pos = 0;
                this.__m_get_pos = 0;
        }
        /**
         * 追加数据
         * @param {I} data 要追加的数据
         */
        append( data )
        {
                if( this.__m_size + data.length < this.__m_length ){
                        if( this.__m_append_pos + data.length < this.__m_length ){  // 没有发生跨边界的情况
                                data.copy( this.__m_buffer , this.__m_append_pos , 0 , data.length );

                                this.__m_append_pos += data.length;
                        }else{ // 发生了跨边界的情况
                                let edge = this.__m_append_pos + data.length - this.__m_length;
                                data.copy( this.__m_buffer , this.__m_append_pos , 0 , edge );
                                data.copy( this.__m_buffer , 0 , edge + 1 );

                                this.__m_append_pos = data.length - edge ;
                        }
                        this.__m_size += data.length;
                }else{
                        throw "data overflow.";
                }
        }
        /**
         * 取出给定数据长度的数据
         * @param {I} size 要取得数据的长度
         * @return 返回操作的结果，如果请求长度小于实际的长度返回请求长度的数据；如果请求长度大于等于数据长度返回所有的数据
         */
        get( size )
        {
                let ret = Buffer.alloc( size );
                if( size < this.__m_size ){
                        if( this.__m_length > size + this.__m_get_pos ){ // 没有发生数据跨边界的情况
                                this.__m_buffer.copy( ret , 0 , this.__m_get_pos , size );
                                this.__m_get_pos += size;
                        }else{ // 数据跨边界
                                let edge = this.__m_get_pos + size - this.__m_length;
                                this.__m_buffer.copy( ret , 0 , this.__m_get_pos , this.__m_get_pos + edge );
                                this.__m_buffer.copy( ret , edget , 0 , size - edge );

                                this.__m_get_pos = size - edge;
                        }
                        this.__m_size -= size;
                }else{
                        if( this.__m_length > size + this.__m_get_pos ){ // 没有发生数据跨边界的情况
                                this.__m_buffer.copy( ret , 0 , this.__m_get_pos , this.__m_size );
                        }else{ // 数据跨边界
                                let edge = this.__m_get_pos + this.__size - this.__m_size;
                                this.__m_buffer.copy( ret , 0 , this.__m_get_pos , edge );
                                this.__m_buffer.copy( ret , edget + 1 , 0 , this.__m_size - edge );
                        }

                        this.__m_size = 0;
                        this.__m_get_pos = 0;
                        this.__m_append_pos = 0;
                }

                return ret;
        }
        /**
         * 检索位置
         * @param {I} from 起始检索位置 
         * @param {I} delim 要检索的数据
         */
        indexOf( from , delim )
        {

        }
}