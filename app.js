var createError = require('http-errors');
const FS = require('fs')
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var session = require( 'express-session')
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var bodyParser = require('body-parser'); /*post方法*/

var app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // 添加json解析

app.use(session({
    secret: 'keyboard cat',
    resave: true, saveUninitialized: true
}))
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

function initConfig()
{
    let data = FS.readFileSync('./etc/config.json');
    try{
        let json = JSON.parse( data.toString() );
        global.user = json.userName;
        global.userPswd = json.password;
    }catch( e ){
        console.log( e );
    }
}

initConfig();
module.exports = app;