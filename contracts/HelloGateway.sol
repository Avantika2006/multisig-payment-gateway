
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract HelloGateway {
    string public message;

    constructor() {
        message = "Welcome to Multi-Signature Payment Gateway!";
    }

    function updateMessage(string memory newMessage) public {
        message = newMessage;
    }
}
