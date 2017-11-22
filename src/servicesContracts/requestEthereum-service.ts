import config from '../config';
import BigNumber from 'bignumber.js';

import * as Types from '../types';
import Artifacts from '../artifacts';
import * as ServiceExtensions from '../servicesExtensions';

const requestEthereum_Artifact = Artifacts.RequestEthereumArtifact;
const requestCore_Artifact = Artifacts.RequestCoreArtifact;

import { Web3Single } from '../servicesExternal/web3-single';
import Ipfs from '../servicesExternal/ipfs-service';

export default class requestEthereumService {
    private web3Single: Web3Single;
    protected ipfs: any;

    // RequestEthereum on blockchain
    protected abiRequestCore: any;
    protected addressRequestCore: string;
    protected instanceRequestCore: any;

    protected abiRequestEthereum: any;
    protected addressRequestEthereum: string;
    protected instanceRequestEthereum: any;

    constructor(web3Provider ? : any) {
        this.web3Single = new Web3Single(web3Provider);
        this.ipfs = Ipfs.getInstance();

        this.abiRequestCore = requestCore_Artifact.abi;
        this.addressRequestCore = config.ethereum.contracts.requestCore;
        this.instanceRequestCore = new this.web3Single.web3.eth.Contract(this.abiRequestCore, this.addressRequestCore);

        this.abiRequestEthereum = requestEthereum_Artifact.abi;
        this.addressRequestEthereum = config.ethereum.contracts.requestEthereum;
        this.instanceRequestEthereum = new this.web3Single.web3.eth.Contract(this.abiRequestEthereum, this.addressRequestEthereum);
    }

    public async createRequestAsPayeeAsync (
        _payer: string,
        _amountInitial: BigNumber,
        _extension: string,
        _extensionParams: Array < any > ,
        _details: string,
        _numberOfConfirmation: number = 0,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): Promise < any > {
        _amountInitial = new BigNumber(_amountInitial);

        return new Promise(async (resolve, reject) => {
            let account = _from || await this.web3Single.getDefaultAccount();
            // check _details is a proper JSON
            if (_amountInitial.lt(0) /*|| !_amountInitial.isInteger()*/ ) return reject(Error("_amountInitial must a positive integer"));
            if (!this.web3Single.isAddressNoChecksum(_payer)) return reject(Error("_payer must be a valid eth address"));
            if (_extension != "" && !this.web3Single.isAddressNoChecksum(_extension)) return reject(Error("_extension must be a valid eth address"));
            if (_extensionParams.length > 9) return reject(Error("_extensionParams length must be less than 9"));
            if ( account == _payer ) {
                return reject(Error("_from must be different than _payer"));
            }

            let paramsParsed: any[];
            if (ServiceExtensions.getServiceFromAddress(_extension)) {
                let parsing = ServiceExtensions.getServiceFromAddress(_extension).getInstance().parseParameters(_extensionParams);
                if(parsing.error) {
                  return reject(parsing.error);
                }
                paramsParsed = parsing.result;
            } else {
                paramsParsed = this.web3Single.arrayToBytes32(_extensionParams, 9);
            }

            this.ipfs.addFile(JSON.parse(_details), (err: Error, hash: string) => {
                if (err) return reject(err);

                var method = this.instanceRequestEthereum.methods.createRequestAsPayee(
                    _payer,
                    _amountInitial,
                    _extension,
                    paramsParsed,
                    hash);

                this.web3Single.broadcastMethod(
                    method,
                    (transactionHash: string) => {
                        // we do nothing here!
                    },
                    (receipt: any) => {
                        // we do nothing here!
                    },
                    (confirmationNumber: number, receipt: any) => {
                        if (confirmationNumber == _numberOfConfirmation) {
                            var event = this.web3Single.decodeLog(this.abiRequestCore, "Created", receipt.events[0]);
                            return resolve({ requestId: event.requestId, transactionHash: receipt.transactionHash, ipfsHash: hash });
                        }
                    },
                    (error: Error) => {
                        return reject(error);
                    },
                    undefined,
                    _from,
                    _gasPrice,
                    _gasLimit);
            });
        });
    }

    public async createRequestAsPayee(
        _payer: string,
        _amountInitial: BigNumber,
        _extension: string,
        _extensionParams: Array < any > ,
        _details: string,
        _callbackTransactionHash: Types.CallbackTransactionHash,
        _callbackTransactionReceipt: Types.CallbackTransactionReceipt,
        _callbackTransactionConfirmation: Types.CallbackTransactionConfirmation,
        _callbackTransactionError: Types.CallbackTransactionError,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): Promise<any> {
        _amountInitial = new BigNumber(_amountInitial);
        let account = _from || await this.web3Single.getDefaultAccount();

        if (_amountInitial.lt(0) /*|| !_amountInitial.isInteger()*/ ) throw Error("_amountInitial must a positive integer");
        if (!this.web3Single.isAddressNoChecksum(_payer)) throw Error("_payer must be a valid eth address");
        if (_extension != "" && !this.web3Single.isAddressNoChecksum(_extension)) throw Error("_extension must be a valid eth address");
        if (_extensionParams.length > 9) throw Error("_extensionParams length must be less than 9");
        if ( account == _payer ) {
            throw Error("account must be different than _payer");
        }

        let paramsParsed: any[];
        if (ServiceExtensions.getServiceFromAddress(_extension)) {
            let parsing = ServiceExtensions.getServiceFromAddress(_extension).getInstance().parseParameters(_extensionParams);
            if(parsing.error) {
                throw Error(parsing.error);
            }
            paramsParsed = parsing.result;
        } else {
            paramsParsed = this.web3Single.arrayToBytes32(_extensionParams, 9);
        }

        this.ipfs.addFile(JSON.parse(_details), (err: Error, hash: string) => {
            if (err) return _callbackTransactionError(err);

            var method = this.instanceRequestEthereum.methods.createRequestAsPayee(
                _payer,
                _amountInitial,
                _extension,
                paramsParsed,
                hash);

            this.web3Single.broadcastMethod(
                method,
                _callbackTransactionHash,
                _callbackTransactionReceipt,
                _callbackTransactionConfirmation,
                _callbackTransactionError,
                undefined,
                _from,
                _gasPrice,
                _gasLimit);
        });
    }


    public acceptAsync(
        _requestId: string,
        _numberOfConfirmation: number = 0,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): Promise < any > {
        return new Promise(async (resolve, reject) => {
            try {
                let request = await this.getRequestAsync(_requestId);    
                let account = await this.web3Single.getDefaultAccount();
                if ( request.state != Types.State.Created) {
                    return reject(Error('request state is not "created"'));
                }
                if ( account == request.payer ) {
                    return reject(Error("account must be the payer"));
                }

                // TODO check if this is possible ? (quid if other tx pending)
                if (!this.web3Single.isHexStrictBytes32(_requestId)) return reject(Error('_requestId must be a 32 bytes hex string (eg.: "0x0000000000000000000000000000000000000000000000000000000000000000"'));

                var method = this.instanceRequestEthereum.methods.accept(_requestId);

                this.web3Single.broadcastMethod(
                    method,
                    (transactionHash: string) => {
                        // we do nothing here!
                    },
                    (receipt: any) => {
                        // we do nothing here!
                    },
                    (confirmationNumber: number, receipt: any) => {
                        if (confirmationNumber == _numberOfConfirmation) {
                            var event = this.web3Single.decodeLog(this.abiRequestCore, "Accepted", receipt.events[0]);
                            return resolve({ requestId: event.requestId, transactionHash: receipt.transactionHash });
                        }
                    },
                    (error: Error) => {
                        return reject(error);
                    },
                    undefined,
                    _from,
                    _gasPrice,
                    _gasLimit);
            } catch(e) {
                return reject(e);
            }
        });
    }

    public async accept(
        _requestId: string,
        _callbackTransactionHash: Types.CallbackTransactionHash,
        _callbackTransactionReceipt: Types.CallbackTransactionReceipt,
        _callbackTransactionConfirmation: Types.CallbackTransactionConfirmation,
        _callbackTransactionError: Types.CallbackTransactionError,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): Promise<any> {
        try {
            let request = await this.getRequestAsync(_requestId);    
            let account = _from || await this.web3Single.getDefaultAccount();
            if ( request.state != Types.State.Created) {
                throw Error('request state is not "created"');
            }
            if ( account != request.payer ) {
                throw Error("from must be the payer");
            }
            // TODO check if this is possible ? (quid if other tx pending)
            if (!this.web3Single.isHexStrictBytes32(_requestId)) throw Error('_requestId must be a 32 bytes hex string (eg.: "0x0000000000000000000000000000000000000000000000000000000000000000"');

            var method = this.instanceRequestEthereum.methods.accept(_requestId);

            this.web3Single.broadcastMethod(
                method,
                _callbackTransactionHash,
                _callbackTransactionReceipt,
                _callbackTransactionConfirmation,
                _callbackTransactionError,
                undefined,
                _from,
                _gasPrice,
                _gasLimit);
        } catch(e) {
            throw e;
        }
    }

    public cancelAsync(
        _requestId: string,
        _numberOfConfirmation: number = 0,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): Promise < any > {
        return new Promise(async (resolve, reject) => {
            try {
                let request = await this.getRequestAsync(_requestId);    
                let account = _from || await this.web3Single.getDefaultAccount();
                if ( account != request.payer && account != request.payee ) {
                    return reject(Error("account must be the payer or the payee"));
                }
                if ( account == request.payer && request.state != Types.State.Created ) {
                    return reject(Error('payer can cancel request in state "created"'));
                }
                if ( account == request.payee && request.state == Types.State.Canceled ) {
                    return reject(Error('payer cannot cancel request already canceled'));
                }
                if ( request.amountPaid != 0 ) {
                    return reject(Error('impossible to cancel a Request with a balance != 0'));
                }
                // TODO check if this is possible ? (quid if other tx pending)
                if (!this.web3Single.isHexStrictBytes32(_requestId)) return reject(Error('_requestId must be a 32 bytes hex string (eg.: "0x0000000000000000000000000000000000000000000000000000000000000000"'));

                var method = this.instanceRequestEthereum.methods.cancel(_requestId);

                this.web3Single.broadcastMethod(
                    method,
                    (transactionHash: string) => {
                        // we do nothing here!
                    },
                    (receipt: any) => {
                        // we do nothing here!
                    },
                    (confirmationNumber: number, receipt: any) => {
                        if (confirmationNumber == _numberOfConfirmation) {
                            var event = this.web3Single.decodeLog(this.abiRequestCore, "Canceled", receipt.events[0]);
                            return resolve({ requestId: event.requestId, transactionHash: receipt.transactionHash });
                        }
                    },
                    (error: Error) => {
                        return reject(error);
                    },
                    undefined,
                    _from,
                    _gasPrice,
                    _gasLimit);
            } catch(e) {
                return reject(e);
            }
        });
    }

    public async cancel(
        _requestId: string,
        _callbackTransactionHash: Types.CallbackTransactionHash,
        _callbackTransactionReceipt: Types.CallbackTransactionReceipt,
        _callbackTransactionConfirmation: Types.CallbackTransactionConfirmation,
        _callbackTransactionError: Types.CallbackTransactionError,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): Promise<any> {
        try {
            let request = await this.getRequestAsync(_requestId);    
            let account = _from || await this.web3Single.getDefaultAccount();
            if ( account != request.payer && account != request.payee ) {
               throw Error("account must be the payer or the payee");
            }
            if ( account == request.payer && request.state != Types.State.Created ) {
                throw Error('payer can cancel request in state "created"');
            }
            if ( account == request.payee && request.state == Types.State.Canceled ) {
                throw Error('payer cannot cancel request already canceled');
            }
            if ( request.amountPaid != 0 ) {
                throw Error('impossible to cancel a Request with a balance != 0');
            }
            // TODO check if this is possible ? (quid if other tx pending)
            if (!this.web3Single.isHexStrictBytes32(_requestId)) throw Error('_requestId must be a 32 bytes hex string (eg.: "0x0000000000000000000000000000000000000000000000000000000000000000"');

            var method = this.instanceRequestEthereum.methods.cancel(_requestId);

            this.web3Single.broadcastMethod(
                method,
                _callbackTransactionHash,
                _callbackTransactionReceipt,
                _callbackTransactionConfirmation,
                _callbackTransactionError,
                undefined,
                _from,
                _gasPrice,
                _gasLimit);
        } catch(e) {
            throw e;
        }
    }

    public payAsync(
        _requestId: string,
        _amount: BigNumber,
        _tips: BigNumber,
        _numberOfConfirmation: number = 0,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): Promise < any > {
        _amount = new BigNumber(_amount);
        _tips = new BigNumber(_tips);
        return new Promise(async (resolve, reject) => {
            try {
                let request = await this.getRequestAsync(_requestId);    
                let account = _from || await this.web3Single.getDefaultAccount();

                // TODO check from == payer ?
                // TODO check if this is possible ? (quid if other tx pending)
                if (!this.web3Single.isHexStrictBytes32(_requestId)) return reject(Error('_requestId must be a 32 bytes hex string (eg.: "0x0000000000000000000000000000000000000000000000000000000000000000"'));
                // TODO use bigNumber
                if (_amount.lt(0) /* || !_amount.isInteger()*/ ) return reject(Error("_amount must a positive integer"));
                // TODO use bigNumber
                if (_tips.lt(0) /* || !_tips.isInteger()*/ ) return reject(Error("_tips must a positive integer"));

                if ( request.state != Types.State.Accepted ) {
                    return reject(Error('request must be accepted'));
                }
                if ( _amount.lt(_tips) ) {
                    return reject(Error('tips declare must be lower than amount sent'));
                }
                if ( request.amountInitial.add(request.amountAdditional).sub(request.amountSubtract).lt(_amount) ) {
                    return reject(Error('You cannot pay more than amount needed'));
                }

                var method = this.instanceRequestEthereum.methods.pay(_requestId, _tips);

                this.web3Single.broadcastMethod(
                    method,
                    (transactionHash: string) => {
                        // we do nothing here!
                    },
                    (receipt: any) => {
                        // we do nothing here!
                    },
                    (confirmationNumber: number, receipt: any) => {
                        if (confirmationNumber == _numberOfConfirmation) {
                            var event = this.web3Single.decodeLog(this.abiRequestCore, "Payment", receipt.events[0]);
                            return resolve({ requestId: event.requestId, transactionHash: receipt.transactionHash });
                        }
                    },
                    (error: Error) => {
                        return reject(error);
                    },
                    _amount,
                    _from,
                    _gasPrice,
                    _gasLimit);
            } catch(e) {
                return reject(e);
            }
        });
    }

    public async pay(
        _requestId: string,
        _amount: BigNumber,
        _tips: BigNumber,
        _callbackTransactionHash: Types.CallbackTransactionHash,
        _callbackTransactionReceipt: Types.CallbackTransactionReceipt,
        _callbackTransactionConfirmation: Types.CallbackTransactionConfirmation,
        _callbackTransactionError: Types.CallbackTransactionError,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): Promise<any> {
        _amount = new BigNumber(_amount);
        _tips = new BigNumber(_tips);
        try {
            let request = await this.getRequestAsync(_requestId);    
            let account = _from || await this.web3Single.getDefaultAccount();

            // TODO check if this is possible ? (quid if other tx pending)
            if (!this.web3Single.isHexStrictBytes32(_requestId)) throw Error('_requestId must be a 32 bytes hex string (eg.: "0x0000000000000000000000000000000000000000000000000000000000000000"');
            // TODO use bigNumber
            if (_amount.lt(0) /* || !_amount.isInteger()*/ ) throw Error("_amount must a positive integer");
            // TODO use bigNumber
            if (_tips.lt(0) /* || !_tips.isInteger()*/ ) throw Error("_tips must a positive integer");
            if ( request.state != Types.State.Accepted ) {
                throw Error('request must be accepted');
            }
            if ( _amount.lt(_tips) ) {
                throw Error('tips declare must be lower than amount sent');
            }
            if ( request.amountInitial.add(request.amountAdditional).sub(request.amountSubtract).lt(_amount) ) {
                throw Error('You cannot pay more than amount needed');
            }

            var method = this.instanceRequestEthereum.methods.pay(_requestId, _tips);

            this.web3Single.broadcastMethod(
                method,
                _callbackTransactionHash,
                _callbackTransactionReceipt,
                _callbackTransactionConfirmation,
                _callbackTransactionError,
                _amount,
                _from,
                _gasPrice,
                _gasLimit);
        } catch(e) {
            throw e;
        }
    }


    public async paybackAsync(
        _requestId: string,
        _amount: BigNumber,
        _numberOfConfirmation: number = 0,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): Promise < any > {
        _amount = new BigNumber(_amount);
        return new Promise(async (resolve, reject) => {
            try {
                let request = await this.getRequestAsync(_requestId);    
                let account = _from || await this.web3Single.getDefaultAccount();

                // TODO check if this is possible ? (quid if other tx pending)
                if (!this.web3Single.isHexStrictBytes32(_requestId)) return reject(Error('_requestId must be a 32 bytes hex string (eg.: "0x0000000000000000000000000000000000000000000000000000000000000000"'));
                // TODO use bigNumber
                if (_amount.lt(0) /* || !_amount.isInteger()*/ ) return reject(Error("_amount must a positive integer"));

                if ( request.state != Types.State.Accepted ) {
                    return reject(Error('request must be accepted'));
                }
                if ( account != request.payee ) {
                    return reject(Error('account must be payee'));
                }
                if ( _amount > request.amountPaid ) {
                    return reject(Error('You cannot payback more than what has been paid'));
                }

                var method = this.instanceRequestEthereum.methods.payback(_requestId);

                this.web3Single.broadcastMethod(
                    method,
                    (transactionHash: string) => {
                        // we do nothing here!
                    },
                    (receipt: any) => {
                        // we do nothing here!
                    },
                    (confirmationNumber: number, receipt: any) => {
                        if (confirmationNumber == _numberOfConfirmation) {
                            var event = this.web3Single.decodeLog(this.abiRequestCore, "Refunded", receipt.events[0]);
                            return resolve({ requestId: event.requestId, amountRefunded: event.amountRefunded, transactionHash: receipt.transactionHash });
                        }
                    },
                    (error: Error) => {
                        return reject(error);
                    },
                    _amount,
                    _from,
                    _gasPrice,
                    _gasLimit);
            } catch(e) {
                return reject(e);
            }
        });
    }

    public async payback(
        _requestId: string,
        _amount: BigNumber,
        _callbackTransactionHash: Types.CallbackTransactionHash,
        _callbackTransactionReceipt: Types.CallbackTransactionReceipt,
        _callbackTransactionConfirmation: Types.CallbackTransactionConfirmation,
        _callbackTransactionError: Types.CallbackTransactionError,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): Promise<any> {
        _amount = new BigNumber(_amount);
        try {
            let request = await this.getRequestAsync(_requestId);    
            let account = _from || await this.web3Single.getDefaultAccount();

            // TODO check if this is possible ? (quid if other tx pending)
            if (!this.web3Single.isHexStrictBytes32(_requestId)) throw Error('_requestId must be a 32 bytes hex string (eg.: "0x0000000000000000000000000000000000000000000000000000000000000000"');
            // TODO use bigNumber
            if (_amount.lt(0) /*|| !_amount.isInteger()*/ ) throw Error("_amount must a positive integer");

            if ( request.state != Types.State.Accepted ) {
                throw Error('request must be accepted');
            }
            if ( account != request.payee ) {
                throw Error('account must be payee');
            }
            if ( _amount > request.amountPaid ) {
                throw Error('You cannot payback more than what has been paid');
            }

            var method = this.instanceRequestEthereum.methods.payback(_requestId);

            this.web3Single.broadcastMethod(
                method,
                _callbackTransactionHash,
                _callbackTransactionReceipt,
                _callbackTransactionConfirmation,
                _callbackTransactionError,
                _amount,
                _from,
                _gasPrice,
                _gasLimit);
        } catch(e) {
            throw e;
        }
    }


    public discountAsync(
        _requestId: string,
        _amount: BigNumber,
        _numberOfConfirmation: number = 0,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): Promise < any > {
        _amount = new BigNumber(_amount);
        return new Promise(async (resolve, reject) => {
            try {
                let request = await this.getRequestAsync(_requestId);    
                let account = _from || await this.web3Single.getDefaultAccount();

                // TODO check if this is possible ? (quid if other tx pending)
                if (!this.web3Single.isHexStrictBytes32(_requestId)) return reject(Error('_requestId must be a 32 bytes hex string (eg.: "0x0000000000000000000000000000000000000000000000000000000000000000"'));
                // TODO use bigNumber
                if (_amount.lt(0) /* || !_amount.isInteger()*/ ) return reject(Error("_amount must a positive integer"));

                if ( request.state == Types.State.Canceled ) {
                    return reject(Error('request must be accepted or created'));
                }
                if ( account != request.payee ) {
                    return reject(Error('account must be payee'));
                }
                console.log("request.amountPaid.add(_amount)")
                console.log(request.amountPaid.add(_amount))
                console.log("request.amountInitial.add(request.amountAdditional).sub(request.amountSubtract)")
                console.log(request.amountInitial.add(request.amountAdditional).sub(request.amountSubtract))
                if ( request.amountPaid.add(_amount).gt(request.amountInitial.add(request.amountAdditional).sub(request.amountSubtract))) {
                    return reject(Error('You cannot discount more than necessary'));
                }

                var method = this.instanceRequestEthereum.methods.discount(_requestId, _amount);

                this.web3Single.broadcastMethod(
                    method,
                    (transactionHash: string) => {
                        // we do nothing here!
                    },
                    (receipt: any) => {
                        // we do nothing here!
                    },
                    (confirmationNumber: number, receipt: any) => {
                        if (confirmationNumber == _numberOfConfirmation) {
                            var event = this.web3Single.decodeLog(this.abiRequestCore, "AddSubtract", receipt.events[0]);
                            return resolve({ requestId: event.requestId, transactionHash: receipt.transactionHash });
                        }
                    },
                    (error: Error) => {
                        return reject(error);
                    },
                    undefined,
                    _from,
                    _gasPrice,
                    _gasLimit);
            } catch(e) {
                return reject(e);
            }
        });
    }

    public async discount(
        _requestId: string,
        _amount: BigNumber,
        _callbackTransactionHash: Types.CallbackTransactionHash,
        _callbackTransactionReceipt: Types.CallbackTransactionReceipt,
        _callbackTransactionConfirmation: Types.CallbackTransactionConfirmation,
        _callbackTransactionError: Types.CallbackTransactionError,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): Promise<any> {
        _amount = new BigNumber(_amount);
        try {
            let request = await this.getRequestAsync(_requestId);    
            let account = _from || await this.web3Single.getDefaultAccount();

            // TODO check if this is possible ? (quid if other tx pending)
            if (!this.web3Single.isHexStrictBytes32(_requestId)) throw Error('_requestId must be a 32 bytes hex string (eg.: "0x0000000000000000000000000000000000000000000000000000000000000000"');
            // TODO use bigNumber
            if (_amount.lt(0) /*|| !_amount.isInteger()*/ ) throw Error("_amount must a positive integer");

            if ( request.state == Types.State.Canceled ) {
                throw Error('request must be accepted or created');
            }
            if ( account != request.payee ) {
                throw Error('account must be payee');
            }
            if ( _amount.add(request.amountPaid).gt(request.amountInitial.add(request.amountAdditional).sub(request.amountSubtract))) {
                throw Error('You cannot payback more than what has been paid');
            }

            var method = this.instanceRequestEthereum.methods.discount(_requestId, _amount);

            this.web3Single.broadcastMethod(
                method,
                _callbackTransactionHash,
                _callbackTransactionReceipt,
                _callbackTransactionConfirmation,
                _callbackTransactionError,
                undefined,
                _from,
                _gasPrice,
                _gasLimit);
        } catch(e) {
            throw e;
        }
    }


    public withdrawAsync(
        _numberOfConfirmation: number = 0,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): Promise < any > {
        return new Promise((resolve, reject) => {
            var method = this.instanceRequestEthereum.methods.withdraw();

            this.web3Single.broadcastMethod(
                method,
                (transactionHash: string) => {
                    // we do nothing here!
                },
                (receipt: any) => {
                    // we do nothing here!
                },
                (confirmationNumber: number, receipt: any) => {
                    if (confirmationNumber == _numberOfConfirmation) {
                        return resolve({ transactionHash: receipt.transactionHash });
                    }
                },
                (error: Error) => {
                    return reject(error);
                },
                undefined,
                _from,
                _gasPrice,
                _gasLimit);
        });
    }

    public withdraw(
        _callbackTransactionHash: Types.CallbackTransactionHash,
        _callbackTransactionReceipt: Types.CallbackTransactionReceipt,
        _callbackTransactionConfirmation: Types.CallbackTransactionConfirmation,
        _callbackTransactionError: Types.CallbackTransactionError,
        _from ? : string,
        _gasPrice ? : number,
        _gasLimit ? : number): void {
        var method = this.instanceRequestEthereum.methods.withdraw();

        this.web3Single.broadcastMethod(
            method,
            _callbackTransactionHash,
            _callbackTransactionReceipt,
            _callbackTransactionConfirmation,
            _callbackTransactionError,
            undefined,
            _from,
            _gasPrice,
            _gasLimit);
    }

    public getRequestAsync(
        _requestId: string): Promise < any > {
        return new Promise((resolve, reject) => {
            if (!this.web3Single.isHexStrictBytes32(_requestId)) return reject(Error('_requestId must be a 32 bytes hex string (eg.: "0x0000000000000000000000000000000000000000000000000000000000000000"'));

            this.instanceRequestCore.methods.requests(_requestId).call(async(err: Error, data: any) => {
                if (err) return reject(err);

                let dataResult: any = {
                    creator: data.creator,
                    payee: data.payee,
                    payer: data.payer,
                    amountInitial: new BigNumber(data.amountInitial),
                    subContract: data.subContract,
                    amountPaid: new BigNumber(data.amountPaid),
                    amountAdditional: new BigNumber(data.amountAdditional),
                    amountSubtract: new BigNumber(data.amountSubtract),
                    state: data.state,
                    extension: data.extension,
                    details: data.details,
                };

                if (ServiceExtensions.getServiceFromAddress(data.extension)) {
                    let extensionDetails = await ServiceExtensions.getServiceFromAddress(data.extension).getInstance().getRequestAsync(_requestId);
                    dataResult.extension = Object.assign(extensionDetails, { address: dataResult.extension });
                }

                if (dataResult.details) {
                    try {
                        dataResult.details = JSON.parse(await this.ipfs.getFileAsync(dataResult.details));
                    } catch (e) {
                        return reject(e);
                    }
                }
                return resolve(dataResult);
            });
        });
    }

    public getRequest(
        _requestId: string,
        _callbackGetRequest: Types.CallbackGetRequest) {
        if (!this.web3Single.isHexStrictBytes32(_requestId)) throw Error('_requestId must be a 32 bytes hex string (eg.: "0x0000000000000000000000000000000000000000000000000000000000000000"');

        this.instanceRequestCore.methods.requests(_requestId).call(async(err: Error, data: any) => {
            if (err) return _callbackGetRequest(err, data);

            let dataResult: any = {
                creator: data.creator,
                payee: data.payee,
                payer: data.payer,
                amountInitial: new BigNumber(data.amountInitial),
                subContract: data.subContract,
                amountPaid: new BigNumber(data.amountPaid),
                amountAdditional: new BigNumber(data.amountAdditional),
                amountSubtract: new BigNumber(data.amountSubtract),
                state: data.state,
                extension: data.extension,
                details: data.details,
            };

            if (ServiceExtensions.getServiceFromAddress(data.extension)) {
                let extensionDetails = await ServiceExtensions.getServiceFromAddress(data.extension).getInstance().getRequestAsync(_requestId);
                dataResult.extension = Object.assign(extensionDetails, { address: dataResult.extension });
            }

            if (dataResult.details) {
                // get IPFS data :
                this.ipfs.getFile(dataResult.details, (err: Error, data: string) => {
                    if (err) return _callbackGetRequest(err, dataResult);
                    dataResult.details = JSON.parse(data);
                    return _callbackGetRequest(err, dataResult);
                });
            } else {
                return _callbackGetRequest(err, dataResult);
            }
        });
    }
}