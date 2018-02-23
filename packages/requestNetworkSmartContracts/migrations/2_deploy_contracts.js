var RequestCore = artifacts.require("./RequestCore.sol");
var RequestEthereum = artifacts.require("./RequestEthereum.sol");

var addressContractBurner = 0;
var feesPerTenThousand = 10; // 0.1 %


var requestCore;
var requestEthereum;
module.exports = function(deployer) {
    deployer.deploy(RequestCore).then(function() {
        return deployer.deploy(RequestEthereum, RequestCore.address).then(function() {
            createInstances().then(function() {
                setupContracts().then(function() {
                    checks();
                });
            });
        });
    });
};

var createInstances = function() {
    return RequestCore.deployed().then(function(instance) {
        requestCore = instance;
        return RequestEthereum.deployed(addressContractBurner).then(function(instance) {
            requestEthereum = instance;
            console.log("Instances set.");
        });
    });
}

var setupContracts = function() {
    return requestCore.adminAddTrustedCurrencyContract(requestEthereum.address).then(function() {
        return requestEthereum.setFeesPerTenThousand(feesPerTenThousand).then(function() {
            console.log("Contracts set up.");
        });
    });
}

var checks = function() {
  requestCore.getStatusContract(requestEthereum.address).then(function(d) {
    console.log("getStatusContract: " + requestEthereum.address + " => " + d);
    requestEthereum.feesPer10000.call().then(function(d) {
        console.log("request ethereum fees per 10000: " + d);
        console.log("Checks complete");
    });
  });
}
