const twit                = require('twit');
const request             = require('request-promise-native');
const configKey           = require('./config-key');
const configKeyStaging    = require('./config-key-staging');

// const mailer = require('./mail');  // to email stuffs
// TO TEST DEPLOY
let isTesting = false;
let testDeploy = false;

let key = testDeploy ? configKeyStaging : configKey;
let Twitter = twit(key);

//query params to query the tweets. Change the query string of your need
let qparams = {
  result_type: 'recent',
  lang: 'en',
  tweet_mode: 'extended',
  count: 20
};

function searchWithOperation(option, tag) {
  let query = `${tag}-filter:retweets`
  qparams.q = query; // appending q string
  
  Twitter.get('search/tweets', qparams).then((response) => {
    let statuses = response && response.data && response.data.statuses;
    if (option == 1) {
      newRetweet(statuses, 0, statuses.length);
    } else if (option == 2) {
      newFavs(statuses, 0, statuses.length);
    }
  }).catch((err) => {
    logger('QUERYERROR: [Error - Querying] - ' + err.message);
  });

}

function newRetweet(statuses, index, length) {
  var tweetId = statuses[index].id_str;
  var currentStatus = statuses[index];
  
  checkForBlockedContent(currentStatus).then((canAllowRetweet) => {
    if (canAllowRetweet && !isTesting) {
      Twitter.post('statuses/retweet/:id', {
        id: tweetId
      }, function (err, response) {
        if (err) {
          loggerRT('RETERROR: [Error - Retweeting] :' + err.message + ' (' + index + ', ' + length + ')');
          if (err.code == 327) {
            if (index < length - 1) {
              newRetweet(statuses, index + 1, length);
            }
          } else if (err.code == 136) {
            loggerRT('RETERROR: Blocked Retweet - ' + currentStatus.user.screen_name);
            if (index < length - 1) {
              newRetweet(statuses, index + 1, length);
            }
          } else {
            loggerRT(err);
          }
        } else if (response) {
          loggerRT('Retweeted !!');
        }
      })
    } else {
      if (index < length - 1) {
        newRetweet(statuses, index + 1, length);
      }
    }
  });
}

var newFavs = function(statuses) {
  var randomTweet = selectRandom(statuses);   // pick a random tweet

  if (typeof randomTweet != 'undefined') {
    Twitter.post('favorites/create', {id: randomTweet.id_str}, function(err, response){
      if(err){
        loggerFav('FAVERROR: [Error - Favoriting] - ' + err.message );
      }
      else{
        loggerFav('Favorited :)');
      }
    });
  }
}

function checkForBlockedContent(currentStatus) {
  let canRetweet = true;

  let retweetedUser = currentStatus.retweeted_status && currentStatus.retweeted_status.user.screen_name; // original tweet owner (this may be a retweet to an another owner)
  let tweetedUser = currentStatus.user && currentStatus.user.screen_name; // first hand
  
  let statusText = (retweetedUser ? currentStatus.retweeted_status.full_text : currentStatus.full_text) || '';
  let normalizedStatus = statusText.toLowerCase();

  loggerRT('---');
  loggerRT(`STATUS: ${normalizedStatus}`);

  if (isAny(normalizedStatus, ['#reactjs', '#react']) && isAny(normalizedStatus, ['#vuejs', '#vue']) && isAny(normalizedStatus, ['#angularjs', '#angular'])) {
    loggerRT(`RETERROR: seems ad - ${statusText}`);
    return new Promise((resolve) => {
      resolve(false);
    });
  }

  return request.get('https://gokatzme.firebaseio.com/twigo/blocks.json').then((response) => {

    let blockedUsers = [];
    let blockedContent = [];
    response = JSON.parse(response);
    let { blockedcontent, blockedusers } = response;

    for (key in blockedcontent) {
      let content = blockedcontent[key];
      if (content && content.text) {
        blockedContent.push(content.text);
      }
    }

    for (key in blockedusers) {
      let user = blockedusers[key];
      if (user && user.name) {
        blockedUsers.push(user.name);
      }
    }

    for (let i = 0; i < blockedContent.length; i++) {
      let content = blockedContent[i] || '';
      content = content.toLowerCase();
      if (normalizedStatus.indexOf(content) >= 0) {
        loggerRT('Blocked Content Matched');
        canRetweet = false;
        break;
      }
    }

    if (canRetweet) {
      if (blockedUsers.includes(tweetedUser) || blockedUsers.includes(retweetedUser)) {
        loggerRT('Blocked User Matched');
        canRetweet = false;
      } 
    }

    loggerRT('canRetweet: ' + canRetweet);
    if (!canRetweet) {
      loggerRT(`Tweet User : ${tweetedUser}`);
      loggerRT(`Retweet User : ${retweetedUser}`);
      loggerRT(`Blocked status: ${statusText}`);
    }
    loggerRT('---');

    return canRetweet;
  });

}


if (isTesting) {

  searchWithOperation(1, '#emberjs'); // Retweet ember

} else {

  searchWithOperation(1, '#emberjs'); // Retweet ember
  setInterval(function () {
    searchWithOperation(1, '#emberjs');
  }, 3600000); // retweat once per hours

  // special retweets about #emberconf
  setTimeout(function () {
    searchWithOperation(1, '#emberconf'); // Retweet ember conf
    setInterval(function () {
      searchWithOperation(1, '#emberconf');
    }, 3600000); // retweat once per hours
  }, 1800000); // start after 30 mins

  setTimeout(function () {
    searchWithOperation(1, '#glimmerjs'); // Retweet glimmer
    setInterval(function () {
      searchWithOperation(1, '#glimmerjs');
    }, 21600000);  // retweat once per 6 hours
  }, 1800000); // start after 30 mins

  searchWithOperation(2, '#emberjs'); // Fav
  setInterval(function () {
    searchWithOperation(2, '#emberjs');
  }, 3600000); // Fav once per hours

}

// function to retrun a random tweet from the tweet array
function selectRandom (arr) {
  var index = Math.floor(Math.random()*arr.length);
  return arr[index];
};

function loggerRT() {
  logger('[TYPE:RT] ', ...arguments);
}

function loggerFav() {
  logger('[TYPE:FAV] ', ...arguments);
}

function logger() {
  console.log(...arguments);
}

function isAny(text, stringList) {
  let hasMatch = false;
  for (let i = 0; i < stringList.length; i++) {
    let str = stringList[i];
    if (text.includes(str)) {
      hasMatch = true;
      break;
    }
  }
  return hasMatch;
}