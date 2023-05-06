'use strict'

/*
  Copyright (c) 2019 Ramón Baas

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

  NodeJS code to control an airconditioner via an Intesis (airconwithme) web server
*/

const http = require('http')
const zlib = require('zlib')

class IntesisACWM {

    constructor(ip, auto) {
        this.ip = ip
        this.auto = (auto == null ? true : auto) // auto login
        this.username = 'admin'
        this.password = 'admin'
        this.session = null;
    }

    // init: Get reference information
    // The file 'data.json' should be accessible on the web server without authentication
    init() {
        return new Promise((resolve, reject) => {
            const url = {
                host: this.ip,
                path: '/js/data/data.json',
                encoding: 'utf8'
            }
            http.get(url, response => {
                const {statusCode} = response
                let data = new Buffer.from('')
                response.on('data', x => {
                    data = Buffer.concat([data, x])
                })
                response.on('end', () => {
                    if (statusCode === 200) {
                        this.ref = JSON.parse(zlib.unzipSync(new Buffer(data, 'utf8')).toString())
                        resolve(this.ref)
                    } else {
                        reject('Cannot load ' + url.path)
                    }
                })
                response.on('error', reject);
            })
        })
    }

    // writeCommand: write a command to the unit via port 80
    // Expected only to be used internally
    writeCommand(cmd, data) {
        return new Promise((resolve, reject) => {
                const payload = JSON.stringify({
                    command: cmd,
                    data: data
                })
                const options = {
                    hostname: this.ip,
                    path: '/api.cgi',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': payload.length
                    },
                    timeout: 2000,
                }
                const req = http.request(options, (res) => {
                    res.on('data', async (d) => {
                        let result = JSON.parse(d)
                        result.code = res.statusCode;

                        if (result.success) {
                            return resolve(result);
                        }

                        // auto login
                        if (this.auto && cmd !== 'login' && result.error.code === 1) {
                            try {
                                await this.login(this.username, this.password);
                                data.sessionID = this.session; // update session ID
                                let result = await this.writeCommand(cmd, data);
                                return resolve(result);
                            } catch (error) {
                                return reject(error)
                            }
                        }
                        reject(result);
                    })
                });
                req.on('error', (err) => reject(err));
                req.write(payload);
                req.end();
            }
        )
    }

    // getInfo: get info about the unit
    // This function does not need autorization
    async getInfo() {
        let result = await this.writeCommand('getinfo', null)
        if (result.success) {
            this.info = result.data.info
            return this.info;
        }
        throw result;
    }

    // Login to the web interface (most functions need authorization to work)
    // Provide a username and password (default is admin, admin)
    async login(username, password) {
        let result = await this.writeCommand('login', {
            username: username,
            password: password
        });

        if (result.success) {
            this.username = username;
            this.password = password;
            this.session = result.data.id.sessionID;
            return result;
        }
        throw result;
    }

    // logout: end the session
    logout() {
        let session = this.session
        delete this.session
        return this.writeCommand('logout', {sessionID: session})
    }

    // getSession: return the session identifier
    getSession() {
        return this.session
    }

    async getCurrentConfig() {
        let result = await this.writeCommand('getcurrentconfig', {sessionID: this.session})
        if (result.success) {
            return result.data.config;
        }
        throw result;
    }

    // getAvailableDataPoints: return the list of uids of the datapoints that are supported by this device
    async getAvailableDataPoints() {
        let result = await this.writeCommand('getavailabledatapoints', {sessionID: this.session});
        if (result.success) {
            return result.data.dp.datapoints;
        }
        throw result;
    }

    // getDataPointValue: get the value of a certain datapoint (use 'null' to get all)
    async getDataPointValue(uid) {
        let result = await this.writeCommand('getdatapointvalue', {sessionID: this.session, uid: uid || 'all'})
        if (result.success) {
            return result.data.dpval;
        }
        throw result;
    }

    // setDataPointValue:
    async setDataPointValue(uid, value) {
        let result = await this.writeCommand('setdatapointvalue', {sessionID: this.session, uid: uid, value: value});
        if (result.success) {
            return result;
        }
        throw result;
    }

    // identify: flash the light on de device to identify it
    identify() {
        return this.writeCommand('identify', {sessionID: this.session})
    }

    // reboot: reboot the device
    reboot() {
        return this.writeCommand('reboot', {sessionID: this.session})
    }

    // Not implemented:
    // - update_password { sessionID, currentPass, newPass }
    // - wpsstart { sessionID }
    // - setdefaults { sessionID }
    // - setconfig { sessionID, ip, netmask, dfltgw, dhcp, ssid, security, lastconfigdatetime }
    // - getaplist { sessionID }

}

module.exports = IntesisACWM
