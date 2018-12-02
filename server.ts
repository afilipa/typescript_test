const pgPromise = require('pg-promise');
const R = require('ramda');
const request = require('request-promise');

// Limit the amount of debugging of SQL expressions
const trimLogsSize: number = 200;
/* command-line processing */
const optionDefinitions = [
  { name: 'perLoc', alias: 'L', type: String }, /* e.g: --perLoc Lisbon -> gives users in Lisbon*/
  { name: 'lisbon', alias: 'l', type: Boolean }, /* e.g: --lisbon  -> something like a shotcut for last command example **just for Lisbon** */
  { name: 'stats', alias: 's', type: Boolean }, /* e.g: --stats -> gives the number of users per location in lovelyDB */
  { name: 'user', alias: 'u', type: String }  /* e.g: --user afilipa -> inserts the given user in lovelyDB */
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


if (optionsCLI.lisbon) {
  UsersInLocation('Lisbon');
}
if (optionsCLI.perLoc) {
  UsersInLocation(optionsCLI.perLoc);
}else if (optionsCLI.perLoc != undefined) {
  console.log("\n**ALERT** You forgot (or you are kidding me :P) your lovely location to search for");
}
if (optionsCLI.stats) {
  UsersPerLocation();
}

if (optionsCLI.user) {
      request({
        uri: `https://api.github.com/users/${optionsCLI.user}`,
        headers: {
          'User-Agent': 'Request-Promise'
        },
        json: true
      })
    .then((data: GithubUsers) =>
      db.one(`INSERT INTO github_users (login, name, company, location) VALUES ($[login], $[name], $[company], $[location]) RETURNING id`, data)
    ).then(({ id }) => console.log(id));
} else if (optionsCLI.user != undefined) {
  console.log("\n**ALERT** I know you are testing me, but come on.. Insert a parameter with the user ;)");
}

  /* creates table IF NOT EXISTS already */
  /* introduces a primary key and unique constraint on table creation */
  db.none(`CREATE TABLE IF NOT EXISTS github_users ( 
    id BIGSERIAL PRIMARY KEY NOT NULL,
    login TEXT NOT NULL UNIQUE,
    name TEXT,
    company TEXT,
    location TEXT)
  `);

/* returns a list of users in given location */
function UsersInLocation(loc) {
  return db.any('select exists(select 1 from information_schema.tables where table_name=\'github_users\')').then(data => data.map(row => row.exists
  )[0]).then(bool => (bool) ?
    db.any('select * from github_users where location = $1', [loc])
      .then(data => { console.log("\nGitHub Users living in " + loc); console.log(`\n|login | name | company|`); data.forEach((row) => console.log("|" + row.login + " | " + row.name + " | " + row.company + "|")); }).then(() => process.exit(0))
    : console.log("\nI apologize but there is no way to search for data, you didn't create the table yet")
  );

}

/* returns the count of users by location */
function UsersPerLocation() {
  return db.any('select exists(select 1 from information_schema.tables where table_name=\'github_users\')').then(data => data.map(row => row.exists
  )[0]).then(bool => (bool) ? db.any('select location, count(*) from github_users group by location', [])
    .then(data => { console.log("\nNext stats of ppl/location\n"); console.log(`|Location  -> #UsersIn |`); data.forEach((row) => console.log("|" + row.location + " -> " + row.count + " |")); })
    : console.log("\nWe Apologize but there is no way to search for data yet")
  );
}



