'use strict';

// Firebase init
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const serviceAccount = require("./config/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: functions.config().env.firebase.databaseurl
});

const firestore = admin.firestore();
const crypto = require('crypto');
const bip39 = require('bip39-light');

// Express and CORS middleware init
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bearerToken = require('express-bearer-token');
// const { createFirebaseAuth } = require ('./middlewares/express_firebase_auth');

const app = express().use(cors({ origin: true }), bodyParser.json(), bodyParser.urlencoded({ extended: true }));
const jengaApi = express().use(cors({ origin: true }), bodyParser.json(), bodyParser.urlencoded({ extended: true }));
var restapi = express().use(cors({ origin: true }), bodyParser.json(), bodyParser.urlencoded({ extended: true }));

// Initialize the firebase auth
// const firebaseAuth = createFirebaseAuth({ ignoredUrls: ['/ignore'], serviceAccount, admin });

const getAuthToken = (req, res, next) => {
  if ( req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer' ) {
    req.authToken = req.headers.authorization.split(' ')[1];
    console.log("Auth Token",req.headers.authorization);
  } else {
    // req.authToken = null;
    return res.status(201).json({
      message: 'Not Allowed'
    });
  }
  next();
};



app.use(getAuthToken);
jengaApi.use(getAuthToken);
restapi.use(getAuthToken);

const PNF = require('google-libphonenumber').PhoneNumberFormat;
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const axios = require("axios");
const jenga = require('./jengakit');
const prettyjson = require('prettyjson');
var options = { noColor: true };

var randomstring = require("randomstring");
// var tinyURL = require('tinyurl');
var { getTxidUrl,
      getAddressUrl,
      getPinFromUser,
      getEncryptKey,
      createcypher,
      decryptcypher,      
      sendMessage,
      arraytojson,
      stringToObj,
      parseMsisdn 
} = require('./utilities');

const iv = functions.config().env.crypto_iv.key;
const enc_decr_fn = functions.config().env.algo.enc_decr;
const  phone_hash_fn = functions.config().env.algo.msisdn_hash;
const escrowMSISDN = functions.config().env.escrow.msisdn;

//@task imports from celokit

const { transfercGOLD,
        transfercUSDx,
        transfercUSD,
        getPublicAddress,
        generatePrivKey,
        getPublicKey,
        getAccAddress,
        sendcGold,
        convertfromWei,
        sendcUSD,
        getContractKit,
        getBlock
} = require('./celokit');

const { getIcxUsdtPrice } = require('./iconnect');
const kit = getContractKit();

// GLOBAL VARIABLES
// let publicAddress = '';
let senderMSISDN = ``;
let receiverMSISDN = ``;
var recipientId = ``;
var senderId = ``;
let amount = ``;



// USSD API 
app.post("/", async (req, res) => {
    // Read variables sent via POST from our SDK
    let { sessionId, serviceCode, phoneNumber, text } = req.body;
    let response = '';    
    

    //check if app exists if false, add to db:
    // Check if users exists in API Database:
    senderMSISDN = phoneNumber.substring(1);
    senderId = await getSenderId(senderMSISDN)
    console.log('senderId: ', senderId);
    let senderstatusresult = await checkIfSenderExists(senderId);
    console.log("Sender Exists? ",senderstatusresult);


    if(senderstatusresult == false){ 
      axios.post(URL);
    }

    var data = text.split('*');
    if (text == '') {
        // This is the first request. Note how we start the response with CON
        response = `CON Welcome to Kotanipay.
        1. Send Money 
        2. Deposit Funds       
        3. Withdraw Cash 
        5. Kotani Dex
        6. PayBill or Buy Goods 
        7. My Account`;
    }     
    
    //  1. TRANSFER FUNDS #SEND MONEY
    else if ( data[0] == '1' && data[1] == null) { 
        response = `CON Enter Recipient`;
    } else if ( data[0] == '1' && data[1]!== '' && data[2] == null) {  //  TRANSFER && PHONENUMBER
        response = `CON Enter Amount to Send:`;
        
    } else if ( data[0] == '1' && data[1] !== '' && data[2] !== '' ) {//  TRANSFER && PHONENUMBER && AMOUNT
        senderMSISDN = phoneNumber.substring(1);
        // console.log('sender: ', senderMSISDN);
        try {
          const recnumber = phoneUtil.parseAndKeepRawInput(`${data[1]}`, 'KE');
          receiverMSISDN = phoneUtil.format(recnumber, PNF.E164);
        } catch (error) {
          console.log(error); 
        }

        receiverMSISDN = receiverMSISDN.substring(1);       
        amount = data[2];
        senderId = await getSenderId(senderMSISDN)
        console.log('senderId: ', senderId);
        recipientId = await getRecipientId(receiverMSISDN)
        console.log('recipientId: ', recipientId);

        // Check if users exists in API Database:
        // let senderstatusresult = await checkIfSenderExists(senderId);
        // console.log("Sender Exists? ",senderstatusresult);
        // if(senderstatusresult == false){ await createNewUser(senderId, senderMSISDN) }

        let recipientstatusresult = await checkIfRecipientExists(recipientId);
        console.log("Recipient Exists? ",recipientstatusresult);
        if(recipientstatusresult == false){ await createNewUser(recipientId, receiverMSISDN) }  
        
        // Retrieve User Blockchain Data
        let senderInfo = await getSenderDetails(senderId);
        console.log('Sender Info: ', senderInfo.data())
        let senderprivkey = await getSenderPrivateKey(senderInfo.data().seedKey, senderMSISDN, iv)
        let receiverInfo = await getReceiverDetails(recipientId);

        let hash = await transfercUSD(senderInfo.data().publicAddress, senderprivkey, receiverInfo.data().publicAddress, amount);
        let url = await getTxidUrl(hash);
        let message2sender = `KES ${amount}  sent to ${receiverMSISDN} Celo Account.
          Transaction URL:  ${url}`;
        let message2receiver = `You have received KES ${amount} from ${senderMSISDN} Celo Account.
        Transaction Link:  ${url}`;
        console.log('tx URL', url);
        // sendMessage("+"+senderMSISDN, message2sender);
        // sendMessage("+"+receiverMSISDN, message2receiver);

        response = `END KES `+amount+` sent to `+receiverMSISDN+` Celo Account
        => Transaction Details: ${url}`;        
    } 
    
//  2. DEPOSIT FUNDS
    else if ( data[0] == '2' && data[1] == null) { 
        response = `CON Enter Amount to Deposit`;
    } else if ( data[0] == '2' && data[1]!== '') {  //  DEPOSIT && AMOUNT
        let depositMSISDN = phoneNumber.substring(1);  // phoneNumber to send sms notifications
        amount = `${data[1]}`;
        // mpesaSTKpush(depositMSISDN, data[1]);   //calling mpesakit library 
        jenga.receiveMpesaStkDeposit(depositMSISDN, data[1]);
        console.log('callling STK push');
        response = `END Depositing KES:  `+amount+` to `+depositMSISDN+` Celo Account`;
    }

//  3. WITHDRAW FUNDS
    else if ( data[0] == '3'  && data[1] == null) {
        response = `CON Enter Amount to Withdraw`;
    }else if ( data[0] == '3' && data[1]!== '' && data[2] == null) {
      response = `CON Enter Full name as it appears on your National ID`;
  }else if ( data[0] == '3' && data[1]!== '' && data[2]!== '') {  //  WITHDRAW && AMOUNT && FULLNAME
        let senderMSISDN = phoneNumber.substring(1);  // phoneNumber to send sms notifications
        console.log('Phonenumber: ', senderMSISDN); 
        let fullname =  `${data[2]}`;
        
        const escrowMSISDN = functions.config().env.escrow.msisdn;
        let receiverMSISDN = escrowMSISDN;

        let amount = `${data[1]}`;
        console.log('Amount to Withdraw: KES.', data[1]);     // const amount = data[1];  

        ///Blockchain Trx
        // console.log('sender: ', senderMSISDN);
        try {
          const recnumber = phoneUtil.parseAndKeepRawInput(`${receiverMSISDN}`, 'KE');
          receiverMSISDN = phoneUtil.format(recnumber, PNF.E164);
        } catch (error) {
          console.log(error); 
        }
        receiverMSISDN = receiverMSISDN.substring(1); 

        senderId = await getSenderId(senderMSISDN)
        console.log('senderId: ', senderId);
        recipientId = await getRecipientId(receiverMSISDN)
        console.log('recipientId: ', recipientId);

        // Check if users exists in API Database:
        // let senderstatusresult = await checkIfSenderExists(senderId);
        // console.log("Sender Exists? ",senderstatusresult);
        // if(senderstatusresult == false){ await createNewUser(senderId, senderMSISDN) }

        let recipientstatusresult = await checkIfRecipientExists(recipientId);
        console.log("Recipient Exists? ",recipientstatusresult);
        if(recipientstatusresult == false){ await createNewUser(recipientId, receiverMSISDN) }  
        
        // Retrieve User Blockchain Data
        let senderInfo = await getSenderDetails(senderId);
        console.log('Sender Info: ', senderInfo.data())
        let senderprivkey = await getSenderPrivateKey(senderInfo.data().seedKey, senderMSISDN, iv)
        let receiverInfo = await getReceiverDetails(recipientId);

        let hash = await transfercUSD(senderInfo.data().publicAddress, senderprivkey, receiverInfo.data().publicAddress, amount);

        ///end of blockchain tx

        // mpesa2customer(senderMSISDN, data[1])    //calling mpesakit library
        if(hash !== null){
          console.log('Tx Hash: ', hash)
          // let amount = '50';
          let currencyCode = 'KES';
          let countryCode = 'KE';
          let recipientName = `${fullname}`;
          let mobileNumber = '';
          try {
            // const recnumber = phoneUtil.parseAndKeepRawInput(`${receiverMSISDN}`, 'KE');
            const number = phoneUtil.parseAndKeepRawInput(`${senderMSISDN}`, 'KE');
            // receiverMSISDN = phoneUtil.format(recnumber, PNF.NATIONAL);
            mobileNumber = '0'+number.getNationalNumber();
          } catch (error) {
            console.log(error); 
          }
          console.log('MobileNumber', mobileNumber)
          // receiverMSISDN = receiverMSISDN.substring(1); 
          // let mobileNumber = "0720670789";
          let withdrawToMpesa = await jenga.sendFromJengaToMobileMoney(amount, currencyCode, countryCode, recipientName, mobileNumber);
          console.log('Sending From Jenga to Mpesa => \n',prettyjson.render(withdrawToMpesa));
          // jenga.sendFromJengaToMobileMoney(data[1], 'KES', 'KE',`${fullname}`, senderMSISDN)  
        }
        response = `END You have withdrawn KES: `+data[1]+` from account: `+phoneNumber.substring(1);        
    }

//  5. KOTANI DEX
    else if ( data[0] == '5' && data[1] == null) {
      // Business logic for first level response
      response = `CON Choose Investment Option
      1. Buy/Sell CELO
      2. Buy/Sell BTC
      3. Buy/Sell ETH
      4. Buy/Sell ICX`;
  }else if ( data[0] == '5' && data[1] == '1' && data[2] == null) {
      let userMSISDN = phoneNumber.substring(1);
      response = `END CELO Trading Coming soon`;    //await getAccDetails(userMSISDN);        
  }else if ( data[0] == '5'  && data[1] == '2' && data[2] == null) {
      let userMSISDN = phoneNumber.substring(1);
      response = `END BTC Trading Coming soon`;        
  }else if ( data[0] == '5'  && data[1] == '3' && data[2] == null) {
    let userMSISDN = phoneNumber.substring(1);
    response = `END ETH Trading Coming soon`;        
  }else if ( data[0] == '5'  && data[1] == '4' && data[2] == null) {
    let userMSISDN = phoneNumber.substring(1);
    response = `CON Choose ICX Option
        1. Check ICX/USD Current Price
        2. Market Buy ICX
        3. Limit Buy ICX
        4. Market Sell ICX
        5. Limit Sell ICX`;        
  }
  //1. Get ICX Current Price
  else if ( data[0] == '5'  && data[1] == '4' && data[2] == '1' ) {
    let userMSISDN = phoneNumber.substring(1);

    let icxprice = await getIcxUsdtPrice();
      console.log('Todays ICX Price=> ', icxprice);

    response = `END Current ICX Price is:
      USD ${icxprice.price}`;

  }
  //2. Market Buy ICX
  else if ( data[0] == '5'  && data[1] == '4' && data[2] == '2' && data[3] == null ) {
    let userMSISDN = phoneNumber.substring(1);

    let icxprice = await getIcxUsdtPrice();
      console.log('Todays ICX Price=> ', icxprice);
    response = `CON Enter ICX Amount:`;

  }else if ( data[0] == '5'  && data[1] == '4' && data[2] == '2' && data[3] !== '') { //2.1: Market Buy amount
    let userMSISDN = phoneNumber.substring(1);
    let amount = data[3]

    let icxprice = await getIcxUsdtPrice();
      console.log('Todays ICX Price=> ', icxprice);

    response = `END Buying ${amount} ICX @ USD ${icxprice.price}`;
  }
  //3. Limit Buy ICX
  else if ( data[0] == '5'  && data[1] == '4' && data[2] == '3' && data[3] == null ) {
    let userMSISDN = phoneNumber.substring(1);

    //let icxprice = await getIcxUsdtPrice();
      //console.log('Todays ICX Price=> ', icxprice);
    response = `CON Enter ICX Amount:`;

  }else if ( data[0] == '5'  && data[1] == '4' && data[2] == '3' && data[3] !== '' && data[4] == null) { //3. Limit Buy ICX
    let userMSISDN = phoneNumber.substring(1);
    let amount = data[3];
    let icxprice = await getIcxUsdtPrice();
      console.log('Todays ICX Price=> ', icxprice);

    response = `CON Current ICX mean Price: USD ${icxprice.price}
                Buying ${amount} ICX 
                Enter your Price in USD`;
  }else if ( data[0] == '5'  && data[1] == '4' && data[2] == '3' && data[3] !== '' && data[4] !== '') { //3.1. Limit Buy ICX
    let userMSISDN = phoneNumber.substring(1);
    let amount = data[3];

    // let icxprice = await getIcxUsdtPrice();
    let limitbuyprice = data[4];
      // console.log('Todays ICX Price=> ', icxprice);

    response = `END Buying ${amount} ICX @ USD ${limitbuyprice}`;
  }

//  6. PAYBILL or BUY GOODS
    else if ( data[0] == '6' && data[1] == null) {
      // Business logic for first level response
      response = `CON Select Option:
      1. Buy Airtime
      2. PayBill
      3. Buy Goods`;
  }
  //  6.1: BUY AIRTIME
  else if ( data[0] == '6' && data[1] == '1' && data[2] == null) { //  REQUEST && AMOUNT
      response = `CON Enter Amount:`;       
  }else if ( data[0] == '6' && data[1] == '1' && data[2]!== '') { 
      response = `END Buying KES ${data[2]} worth of airtime for: `+phoneNumber;        
  }

  //  6.2: PAY BILL  
  else if ( data[0] == '6' && data[1] == '2') {
      response = `END PayBill feature Coming soon`;        
  }

  //  6.1: BUY GOODS
  else if ( data[0] == '6'  && data[1] == '3') {
      let userMSISDN = phoneNumber.substring(1);
      response = `END BuyGoods feature Coming soon`;        
  }

        

//  7. ACCOUNT DETAILS
    else if ( data[0] == '7' && data[1] == null) {
        // Business logic for first level response
        response = `CON Choose account information you want to view
        1. Account Details
        2. Account balance
        3. Account Backup`;
    }else if ( data[0] == '7' && data[1] == '1') {
        let userMSISDN = phoneNumber.substring(1);
        response = await getAccDetails(userMSISDN);        
    }else if ( data[0] == '7'  && data[1] == '2') {
        let userMSISDN = phoneNumber.substring(1);
        response = await getAccBalance(userMSISDN);        
    }else if ( data[0] == '7'  && data[1] == '3') {
      let userMSISDN = phoneNumber.substring(1);
      response = await getSeedKey(userMSISDN);        
  }
  else{
    // text == '';
    response = `END Sorry, I dont understand your option`;
  }

    res.set('Content-Type: text/plain');
    res.send(response);
    // DONE!!!
});

app.post("/newuser", async (req, res) => {
  // Read variables sent via POST from our SDK
  const { sessionId, serviceCode, phoneNumber, text } = req.body;
  var userdata = '';
  let newUserPin = '';
  let confirmUserPin = '';
  let idnumber = '';
  let firstname = '';
  let lastname = '';

  let response = '';   
  var data = text.split('*'); 
  
  // res.set('Content-Type: text/plain');
  

  //check if app exists if false, add to db:
  // Check if users exists in API Database:
  senderMSISDN = phoneNumber.substring(1);

  senderId = await getSenderId(senderMSISDN)
  console.log('senderId: ', senderId);
  let senderstatusresult = await checkIfSenderExists(senderId);
  console.log("Sender Exists? ",senderstatusresult);


  if(senderstatusresult == false){ 
    userdata = text.split('*');
    newUserPin = '';
    confirmUserPin = '';
    idnumber = '';
    firstname = '';
    lastname = '';

    
    if (text == '') {
    response = `CON Welcome to Kotanipay.
      Enter new PIN`;
    }
    else if (userdata[0] !== null && userdata[0] !== '' && userdata[1] == null){ //userdata[0] !== null && userdata[0] !== '' && userdata[1] == null
      newUserPin = userdata[0];
      console.log('PIN ', newUserPin);
      response = `CON Reenter PIN to confirm`;
    }

    else if ( userdata[0] !== null && userdata[0] !== ''  && userdata[1] !== null  && userdata[1] !== ''  && userdata[2] == null ) {
      confirmUserPin = userdata[1];
      console.log('confirm PIN ', confirmUserPin);
      response = `CON Enter National ID Number`;

      // if(newUserPin !== confirmUserPin){ 
      //   response = `CON Reenter PIN to confirm`;
      //   userdata[1] = null;
      //   // res.set('Content-Type: text/plain')
      //   // res.send(response);
      }
      else if (userdata[0] !== null && userdata[0] !== '' && userdata[1] !== null && userdata[1] !== ''  && userdata[2] !== null && userdata[2] !== ''  && userdata[3] == null){ //userdata[0] !== null && userdata[0] !== '' && userdata[1] == null
          idnumber = userdata[2];

          response = `CON Enter First Name`;
          // res.set('Content-Type: text/plain');
          // res.send(response);
      }

      
      // res.set('Content-Type: text/plain')
      // res.send(response);
      else if (userdata[0] !== null && userdata[0] !== '' && userdata[1] !== null && userdata[1] !== ''  && userdata[2] !== null && userdata[2] !== ''  && userdata[3] !== null  && userdata[4] !== null){ //userdata[0] !== null && userdata[0] !== '' && userdata[1] == null
        firstname = userdata[3];
        console.log('Firstname: ', firstname);

        response = `CON Enter Last Name`;
        // res.set('Content-Type: text/plain');
        // res.send(response);
      }

      else if (userdata[0] !== null && userdata[0] !== '' && userdata[1] !== null && userdata[1] !== ''  && userdata[2] !== null && userdata[2] !== ''  && userdata[3] !== null  && userdata[4] !== null){ //userdata[0] !== null && userdata[0] !== '' && userdata[1] == null
        lastname = userdata[4];
        console.log('Lastname: ', lastname);

        response = `END Welcome to Kotani`;
        // res.set('Content-Type: text/plain');
        // res.send(response);
      }
      console.log(`${newUserPin} : ${confirmUserPin} : $ ${idnumber} : ${firstname} : ${lastname}`);


      // console.log('confirm PIN ', confirmUserPin);
      // console.log('Text ', text);        
      // console.log('Before clear: ', text);  }      
    

    
      // text = '';
    //   console.log('After clear: ', text);
    //   if(newUserPin !== confirmUserPin){          
    //     response = `CON Confirm User PIN`;
    //     res.send(response);
    //   }else if{
    // }
    
    // else if ( userdata[0] !== null && userdata[0] !== ''  && userdata[1] !== null  && userdata[1] !== '') { 
    //   response = `END Enter National ID Number`;
    //     res.send(response);
    //   idnumber = text;
    //   console.log('ID Number: ', idnumber);
    //   console.log('confirm PIN ', confirmUserPin);
    //   console.log('Text ', text);
    //   if(newUserPin == confirmUserPin){          
    //     response = `END Enter National ID Number`;
    //   }
    //   console.log('Before clear: ', text);
      
    // }

    // // text = '';
    // console.log('After clear value: ',text);
    // await createNewUser(senderId, senderMSISDN)

    // res.set('Content-Type: text/plain');
    res.send(response); 

  }


//res.set('Content-Type: text/plain');
//res.send(response);
// DONE!!!

});

//JENGA CALLBACK API
jengaApi.post("/", async (req, res) => {

  console.log(prettyjson.render(req.body, options));

  // jengaDeposit();
  

  //var options = { noColor: true };
  // Read variables sent via POST from our SDK
  
  // const data = req.body;
  // console.log(data);
  res.send('Jenga API Callback Successful!');
});


//USSD APP
async function getAccDetails(userMSISDN){
  console.log(userMSISDN);
  let userId = await getSenderId(userMSISDN);
  // let userstatusresult = await checkIfSenderExists(userId);
  // console.log("User Exists? ",userstatusresult);
  // if(userstatusresult == false){ await addUserDataToDB(userId, userMSISDN) }      
  
  let userInfo = await getSenderDetails(userId);
  console.log('User Address => ', userInfo.data().publicAddress);
  let url = await getAddressUrl(`${userInfo.data().publicAddress}`)
  console.log('Address: ',url);  
  text = '';          
  return `CON Your Account Number is: ${userMSISDN}
              ...Account Address is: ${url}`;
}

async function getSenderPrivateKey(seedCypher, senderMSISDN, iv){
  try {
    let senderSeed = await decryptcypher(seedCypher, senderMSISDN, iv);
    console.log('Sender seedkey=>',senderSeed);
    let senderprivkey =  `${await generatePrivKey(senderSeed)}`;
    return new Promise(resolve => {  
      resolve (senderprivkey)        
    }); 
  }catch(err){console.log('Unable to decrypt cypher')}
}

async function getSeedKey(userMSISDN){
  // console.log(userMSISDN);
  let userId = await getSenderId(userMSISDN);
  console.log('User Id: ', userId)

  // let userstatusresult = await checkIfSenderExists(userId);
  // console.log("User Exists? ",userstatusresult);
  // if(userstatusresult == false){ await addUserDataToDB(userId, userMSISDN) }      
  
  let userInfo = await getSenderDetails(userId);
  console.log('SeedKey => ', userInfo.data().seedKey);
          
  return `END Your Backup Phrase is: ${userInfo.data().seedKey}`;
}

function getPinFromUser(){
  return new Promise(resolve => {    
    let loginpin = randomstring.generate({ length: 5, charset: 'numeric' });
    resolve (loginpin);
  });
}
  
async function addUserDataToDB(userId, userMSISDN){ 
  try {
    console.log('user ID: ', userId)
    let loginpin = await generateLoginPin(); 
    var enc_loginpin = await createcypher(loginpin, userMSISDN, iv);
    let mnemonic = await bip39.generateMnemonic(256);
    var enc_seed = await createcypher(mnemonic, userMSISDN, iv);
    console.log('Encrypted seed=> ', enc_seed);
    let publicAddress = await getPublicAddress(mnemonic);
    console.log('Public Address: ', publicAddress); 
    let initdepohash = await signupDeposit(publicAddress, escrowMSISDN);
    console.log('Signup Deposit', initdepohash);

    let message2receiver = `Welcome to Kotanipay, your account has been created with PIN ${loginpin}
      To access your account dial *483*354#`;

    sendMessage("+"+userMSISDN, message2receiver);

    const newAccount = {
        'seedKey' : `${enc_seed}`,
        'publicAddress' : `${publicAddress}`,
        'userLoginPin' : enc_loginpin
    };

    let db = firestore.collection('accounts').doc(userId);
    db.set(newAccount).then(newDoc => {
      console.log("Document Created:\n", newDoc.id);
      
    })    
  } catch (err) {
    console.log(err);
  }
  return true; 
}

async function signupDeposit(publicAddress, escrowMSISDN){
  console.log('Escrow: ', escrowMSISDN);
  let amount = 2;
  console.log('Amount: ', amount);
  let escrowId = await getSenderId(escrowMSISDN);
  console.log('EscrowId: ', escrowId);

  let escrowInfo = await getSenderDetails(escrowId);
  console.log('Escrow Sender Address => ', escrowInfo.data().publicAddress);
  let escrowPrivkey = await getSenderPrivateKey(escrowInfo.data().seedKey, escrowMSISDN, iv);

  let hash = await transfercUSD(escrowInfo.data().publicAddress, escrowPrivkey, publicAddress, amount)    
  return hash;
} 

      
  
async function getSenderDetails(senderId){
  let db = firestore.collection('accounts').doc(senderId);
  let result = await db.get();
  return result;    
}
    
  async function getReceiverDetails(recipientId){    
    let db = firestore.collection('accounts').doc(recipientId);
    let result = await db.get();
    return result;
  }
  
  async function getAccBalance(userMSISDN){

    console.log(userMSISDN);
    let userId  = await getSenderId(userMSISDN)
    console.log('UserId: ', userId)
  
    // let userstatusresult = await checkIfSenderExists(userId);
    // console.log("User Exists? ",userstatusresult);
    // if(userstatusresult == false){ await addUserDataToDB(userId, userMSISDN); 
    //   console.log('creating user acoount');
    // }    
    
    let userInfo = await getSenderDetails(userId);
    console.log('User Address => ', userInfo.data().publicAddress);
    
    const stableTokenWrapper = await kit.contracts.getStableToken()
    let cUSDBalance = await stableTokenWrapper.balanceOf(userInfo.data().publicAddress) // In cUSD
    cUSDBalance = kit.web3.utils.fromWei(cUSDBalance.toString(), 'ether');
    console.info(`Account balance of ${cUSDBalance.toString()}`)
  
    const goldTokenWrapper = await kit.contracts.getGoldToken()
    let cGoldBalance = await goldTokenWrapper.balanceOf(userInfo.data().publicAddress) // In cGLD
    cGoldBalance = kit.web3.utils.fromWei(cGoldBalance.toString(), 'ether');    
    console.info(`Account balance of ${cGoldBalance.toString()}`)
  
    return `END Your Account Balance is:
              Kenya Shillings: ${cUSDBalance*100}`;
  }
  
  function getSenderId(senderMSISDN){
    return new Promise(resolve => {
      let senderId = crypto.createHash(phone_hash_fn).update(senderMSISDN).digest('hex');
      resolve(senderId);
    });
  } 
    
  function getRecipientId(receiverMSISDN){
    return new Promise(resolve => {
        let recipientId = crypto.createHash(phone_hash_fn).update(receiverMSISDN).digest('hex');
        resolve(recipientId);
    });
  } 
  
  async function checkIfSenderExists(senderId){      
    return await checkIfUserExists(senderId);
  }
  
  async function checkIfRecipientExists(recipientId){    
    return await checkIfUserExists(recipientId);
  }

  async function checkIfUserExists(userId){
    var exists;         
    return new Promise(resolve => {
      admin.auth().getUser(userId)
        .then(function(userRecord) {          
            if (userRecord) {
                console.log('Successfully fetched user data:', userRecord.uid);
                exists = true;
                resolve (exists);
            } else {
              console.log("Document", userId, "does not exists:\n");
              exists = false;
              resolve (exists);
            }
        })
        .catch(function(error) {
            console.log('Error fetching user data:', userId, "does not exists:\n");
            exists = false;
            resolve (exists);
        });
    });    
}  

function createNewUser(userId, userMSISDN){
  return new Promise(resolve => {
      admin.auth().createUser({
          uid: userId,
          phoneNumber: `+${userMSISDN}`
      })
      .then(function(userRecord) {
          console.log('Successfully created new user:', userRecord.uid);
      })
      .catch(function(error) {
          console.log('Error creating new user:', error);
      });
  });  
}
        
function generateLoginPin(){
  return new Promise(resolve => {
    resolve (randomstring.generate({ length: 5, charset: 'numeric' }));
  });
}     

exports.kotanipay = functions.region('europe-west3').https.onRequest(app);       //.region('europe-west1')

exports.addUserData = functions.region('europe-west3').auth.user().onCreate(async (user) => {
    console.log('creating new user data:', user.uid, user.phoneNumber)
    await addUserDataToDB(user.uid, user.phoneNumber.substring(1));
});

exports.jengaCallback = functions.region('europe-west3').https.onRequest(jengaApi);
