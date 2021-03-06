const start = async function() {
    // import needed libs
    var MongoClient = require('mongodb').MongoClient;
    const fetch = require('node-fetch');
    var net = require('net');
    var gini = require("gini");
    var express = require("express");
    var cors = require('cors')
        // connect to mongodb
    var url = "mongodb://localhost:27017/";
    MongoClient.connect(url, function(err, db) {
        if (err) throw err;
        // open the DB
        var dbo = db.db("avrioexplorer");

        var client = new net.Socket(); // create a new socket to connect to the avrio-daemon RPC server
        var init = false;
        client.connect(17785, '127.0.0.1', function() {
            console.log('Connected to rpc');
            client.write('init'); // write first message to the daemon
        });
        var app = express(); // launch the API app
        app.use(cors()) // open the API to everyone
        var tot_json = `[`
        app.listen(1234, () => {
            console.log("API running on port 1234");
        });
        app.get("/dag", (req, res, next) => { // gives every block we have recieved over API
            // TODO: get from daemon where needed, use :from :to params
            res.json(tot_json + "]");
        });

        app.get("/lastten", (req, res, next) => { // gets the last ten blocks
            let blocks_cursor = dbo.collection("blocks").find().sort({ _id: -1 }).limit(10);

            blocks_cursor.toArray().then(array => {
                res.json(array);
            })
        })

        app.get("/chaincount", (req, res, next) => { // gets the number of chains/ wallets
            fetch(`http://127.0.0.1:8000/api/v1/chainlist`)
                .then(function(response) {
                    return response.json();
                })
                .then(function(myJson) {
                    if (myJson['success'] == true) {
                        res.json({ count: myJson['list'].length })
                    } else {
                        console.log("Failed to get chain count from node")
                        res.json({ count: 0 })
                    }
                })
        })

        app.get("/chainlist", (req, res, next) => { // gets the list of chains/wallets public key's
            fetch(`http://127.0.0.1:8000/api/v1/chainlist`)
                .then(function(response) {
                    return response.json();
                })
                .then(function(myJson) {
                    if (myJson['success'] == true) {
                        res.json(myJson['list'])
                    } else {
                        console.log("Failed to get chain count from node")
                        res.json([])
                    }
                })
        })
        app.get("/gini/:json_set", (req, res, next) => {
            // calculates the gini coefficent of the json encoded dataset
            data = JSON.parse(req.params.json_set);
            var result = gini.unordered(data);
            res.json({ result: result * 100 });
        })

        app.get("/username/:publickey", (req, res, next) => {
            // returns the username of an account
            fetch(`http://127.0.0.1:8000/api/v1/username_for_publickey/${req.params.publickey}`)
                .then(function(response) {
                    return response.json();
                })
                .then(function(myJson) {
                    if (myJson['success'] == true) {
                        res.json(myJson['username'])
                    } else {
                        console.log("Failed to get chain count from node")
                        res.json()
                    }
                })
        })

        app.get("/address/:publickey", (req, res, next) => {
            // returns the address of an publickey
            fetch(`http://127.0.0.1:8000/api/v1/publickey_to_address/${req.params.publickey}`)
                .then(function(response) {
                    return response.json();
                })
                .then(function(myJson) {
                    if (myJson['success'] == true) {
                        res.json(myJson['address'])
                    } else {
                        console.log("Failed to get chain count from node")
                        res.json()
                    }
                })
        })

        app.get("/balance/:chain", (req, res, next) => { // gets the balance of an account
            fetch(`http://127.0.0.1:8000/api/v1/balances/${req.params.chain}`)
                .then(function(response) {
                    return response.json();
                })
                .then(function(myJson) {
                    if (myJson['success'] == true) {
                        res.json(myJson)
                    } else {
                        console.log("Failed to get chain balance from node")
                        res.json([])
                    }
                })
        })

        app.get("/block/:hash", (req, res, next) => { // gets a block by its hash
            let blocks_cursor = dbo.collection("blocks").find({ hash: req.params.hash });

            blocks_cursor.toArray().then(array => {
                if (typeof array[0] != 'undefined') {
                    console.log(array[0]);
                    res.json(array[0]);
                } else {
                    fetch(`http://127.0.0.1:8000/api/v1/blocks/${req.params.hash}`)
                        .then(function(response) {
                            return response.json();
                        })
                        .then(function(myJson) {
                            console.log(myJson);
                            if (myJson['success'] == true) {
                                res.json(myJson['response']['block'])
                            } else {
                                console.log("Failed to get block from node")
                                res.json([])
                            }
                        })
                };
            });
        })

        client.on('data', function(data) { // when we recieve data from the RPC
            console.log('Received: ' + data);
            if (!init) { // is this the first message recieved?
                console.log("Not init, sending *");
                client.write('*'); // register all services
                init = true; // set init to true
            } else { // we have already registered all services, parse the data
                var rec = JSON.parse(data) // we only listen for blocks for now
                if (rec.m_type == "block") {
                    var block = JSON.parse(rec.content)
                    dbo.collection("blocks").insertOne(block, function(err, res) { // save the block
                        if (err) throw err;
                        console.log(`1 block with hash=${block['hash']} inserted`);

                    });
                    if (block.block_type = "Send") {
                        let new_json = `{hash:${block.hash}, time: ${block.header.timestamp}, public_key: ${block.header.chain_key}, links: [ {hash: ${block.header.prev_hash}, type: 0 } ] },`

                        tot_json = tot_json + new_json
                    } else {
                        let new_json = `{hash:${block.hash}, time: ${block.header.timestamp}, public_key: ${block.header.chain_key}, links: [ {hash: ${block.header.prev_hash}, type: 0 }, {hash: ${block.send_block}, type: 1 } ] },`
                        tot_json = tot_json + new_json
                    }
                } else {
                    console.log(`Recieved non block msg, type=${rec.m_type}`)
                }
            }
        });

        client.on('close', function() {
            console.log('rpc closed');
        });
    });
}
start();