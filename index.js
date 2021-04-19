const crypto = require('crypto');
const unquote = require('unquote');
const {Driver, getCredentialsFromEnv, getLogger} = require('ydb-sdk');

exports.handler = async function (event, context) {
    let url = event.url;
    if (url[url.length-1] == '?') {
        url = url.substr(0,url.length-1 )
    }
    return await getResult(url, event, context)
};
function getResult(url, event, context) {
    console.log(url);
    if (url == "/shortennode") {
        return shorten(event,false)
    }
    if (url == "/shortennode2") {
        return shorten(event,true)
    }
    if (url.indexOf("/rnode/")!==-1) {
        return redirect(event,context)
    }

    return return404('несуществующий путь');
}
function shorten(event, fullNode) {
    body = event.body
    if (body !== undefined && body!=='') {
        let original_host = event.headers.Origin;
        let link_id = sha256(body);
        let cal = '/r/';
        if (fullNode) {
            cal = '/rnode/';
        }
        let shorturl = original_host+cal+link_id;
        console.log('original_host',original_host);
        console.log('shorturl',shorturl)
        let unquoteBody = unquote(body);
        return insertLink(link_id,unquoteBody)
          .then(noRes=>{
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json'
            },
            'isBase64Encoded': false,
            'body': JSON.stringify({
                'url': shorturl,
                'result_insert': res
            })
        })
        .catch(err=>{
            console.log(err);
            return return404('Внутренняя ошибка')
        })
    }
    return return404('не передан урл')
}
function redirect(event,context) {
    console.log('redir');
    console.log('params',event.params);
    let result = await getLink(event.params.id)
    .then( result => {
        if (result!==false) {
            return {
                'statusCode': 302,
                'headers': {
                    'Location': result
                },
                'isBase64Encoded': false,
                'body': ''
            }
        } else {
            throw new Error('no link')
        }
    })
      .catch(err=>{
           console.log(err)
           return return404('Данной ссылки не существует')
      })
}
function return404(text) {
    return {
        'statusCode': 404,
        'headers': {
            'Content-Type': 'application/json'
        },
        'isBase64Encoded': false,
        'body': JSON.stringify({
            result: text,
            status: false
        })
    }
}
function sha256(message) {
    const secret = 'abcdefg';
    const hash = crypto.createHmac('sha256', secret)
        .update(message)
        .digest('hex');
    return hash.substr(0,6)
}

function insertLink(id,url) {
    //инитим базу
    const logger = getLogger({level: 'debug'});
    const entryPoint = 'grpcs://'+process.env.database;
    const dbName = process.env.endpoint
    const authService = getCredentialsFromEnv(entryPoint, dbName, logger);
    const driver = new Driver(entryPoint, dbName, authService);
    //
    return driver.ready(10000)
    .then(res=>{
        if (!res) {
            throw new Error(`Driver has not become ready in 10 seconds!`)
        }
    })
    .then(noRes=>{
        return driver.tableClient.withSession(async (session) => {
            if (await getLink(id) === false) {
                let query = "PRAGMA TablePathPrefix(\""+dbName+"\");INSERT INTO links (id,link) VALUES ('"+id+"','"+url+"')";
                console.log('insert query',query)
                const {resultSets} = await session.executeQuery(query);
                return resultSets;
            } else {
                return 'link exist in db'
            }
        });
    })
    .catch(err=>{
        logger.fatal(err.getMessage());
        process.exit(1);
    })
}
async function getLink(id) {
    //инитим базу
    const logger = getLogger({level: 'debug'});
    const entryPoint = 'grpcs://'+process.env.database;
    const dbName = process.env.endpoint
    const authService = getCredentialsFromEnv(entryPoint, dbName, logger);
    const driver = new Driver(entryPoint, dbName, authService);
    //
    return driver.ready(10000)
    .then(res=>{
        if (!res) {
            throw new Error(`Driver has not become ready in 10 seconds!`)
        }
    })
    .then(noRes=>{
        return driver.tableClient.withSession(async (session) => {
            let query = "PRAGMA TablePathPrefix(\""+dbName+"\");SELECT link FROM links WHERE id=\""+id+"\"";
            console.log('select query',query);
            return await session.executeQuery(query).then(res => {b = res}).then(() => {
                if (b.resultSets[0].rows[0] == undefined) {
                    console.log('link not exist');
                    return false;
                }
                console.log('link is ',b.resultSets[0].rows[0].items[0].textValue);
                return b.resultSets[0].rows[0].items[0].textValue
            });
        });
    })
    .catch(err=>{
        logger.fatal(err.getMessage());
        process.exit(1);
    })
}
