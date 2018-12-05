const pgPromise = require('pg-promise');
const R = require('ramda');
const request = require('request-promise');
const question = require('prompt-sync')();

// Limit the amount of debugging of SQL expressions
const trimLogsSize: number = 200;

/* ** command - line processing **
use cases:
  --perLoc Lisbon -> gives users in Lisbon * /
  --lisbon -> something like a shotcut for last command example ** just for Lisbon **
  --stats -> gives the number of users per location in lovelyDB
  --user afilipa -> inserts the given user in lovelyDB */
const optionDefinitions = [
  { name: 'perLoc', alias: 'L', type: String },
  { name: 'lisbon', alias: 'l', type: Boolean },
  { name: 'stats', alias: 's', type: Boolean },
  { name: 'user', alias: 'u', type: String }
]
const commandLineArgs = require('command-line-args');
const optionsCLI = commandLineArgs(optionDefinitions);

// Database interface
interface DBOptions {
  host: string
  , database: string
  , user?: string
  , password?: string
  , port?: number
};

// Actual database options
const options: DBOptions = {
  user: "postgres",
  password: "lovelyDB",
  host: 'localhost',
  database: 'lovelystay_test',
};

console.info('Connecting to the database:',
  `${options.user}@${options.host}:${options.port}/${options.database}`);

const pgpDefaultConfig = {
  promiseLib: require('bluebird'),
  // Log all querys
  query(query) {
    console.log('[SQL   ]', R.take(trimLogsSize, query.query));
  },
  // On error, please show me the SQL
  error(err, e) {
    if (e.query) {
      console.error('[SQL   ]', R.take(trimLogsSize, e.query), err);
    }
  }
};

const pgp = pgPromise(pgpDefaultConfig);
const db = pgp(options);


interface GithubUsers {
  id: number,
  login: string,
  name: string,
  company: string,
  location: string
};

/* creates table IF NOT EXISTS already */
/* introduces a primary key and unique constraint on table creation */
db.none(`CREATE TABLE IF NOT EXISTS github_users ( 
  id BIGSERIAL PRIMARY KEY NOT NULL,
  login TEXT NOT NULL UNIQUE,
  name TEXT,
  company TEXT,
  location TEXT)
`)
  .then(() => console.log("\nWe have database! Let's do lovely things now ;)"))
  .then(() => (!Object.keys(optionsCLI).length || commandErrors()) ? process.exit(0) : processOptions());


const keys = Object.keys(optionsCLI);

/* check errors in given commands */
function commandErrors() {
  for (let i in keys) {
    if (optionsCLI[keys[i]] == null) {
      console.log("The given option --" + keys[i] + " has its parameter missing");
      return true;
    }
  }
  return false;
}
/* process the commands given */
function processOptions() {
  for (let i in keys) {
    switch (keys[i]) {
      case 'lisbon':
        UsersInLocation('Lisbon', i);
        break;
      case 'perLoc':
        UsersInLocation(optionsCLI.perLoc, i);
        break;
      case 'stats':
        StatsPerLocation();
        break;
      case 'user':
        request({
          uri: `https://api.github.com/users/${optionsCLI.user}`,
          headers: {
            'User-Agent': 'Request-Promise'
          },
          json: true
        })
          .then((data: GithubUsers) => {
            console.log("The info to insert in db is: " +
              JSON.stringify({ 'login': data.login, 'name': data.name, 'company': data.company, 'location': data.location }));
            let x = question("Do you confirm this data? (y/n)");
            if (x.toLowerCase() == 'y') {
              return db.one(`INSERT INTO github_users (login, name, company, location) 
                VALUES ($[login], $[name], $[company], $[location]) RETURNING id`, data)
            }
            else { console.log("User was not inserted this time"); return { id: -1 } };
          })
          .then(({ id }) => (id > 0) ? console.log(id) : '')
          .then(() => { (keys.indexOf('user') == keys.length - 1) ? process.exit(0) : "" });
        break;
      default:
        break;
    }
  }
}



/* returns a list of users in given location */
function UsersInLocation(loc, indexCommand) {
  return db.any(`select exists(select 1 
    from information_schema.tables 
    where table_name='github_users')`)
    .then(data => data.map(row => row.exists)[0])
    .then(bool => (bool) ?
      db.any(`select * from github_users where lower(location) like lower(concat('%', $1,'%'))`, [loc])
        .then(data => {
          if (data.length) {
            console.log("\nGitHub Users living in " + loc);
            console.log(`\n|login | name | company| Location`);
            data.forEach((row) =>
              console.log("|" + row.login + " | " + row.name + " | " + row.company + "|" + row.location));
          } else {
            console.log("\nOoops! No users in " + loc);
          }
        })

      : console.log("\nThere is no way to search for data, you didn't create the table yet :P")
    ).then(() => (indexCommand == keys.length - 1) ? process.exit(0) : "");

}

/* returns the count of users by location */
function StatsPerLocation() {
  return db.any('select exists(select 1 from information_schema.tables where table_name=\'github_users\')')
    .then(data => data.map(row => row.exists)[0])
    .then(bool => (bool) ? db.any('select location, count(*) from github_users group by location', [])
      .then(data => {
        console.log("\nNext stats of ppl/location\n");
        console.log(`|Location  -> #UsersIn |`);
        data.forEach((row) => console.log("|" + row.location + " -> " + row.count + " |"));
      })
      : console.log("\nWe Apologize but there is no way to search for data yet")
    ).then(() => (keys.indexOf('stats') == keys.length - 1) ? process.exit(0) : "");
}



