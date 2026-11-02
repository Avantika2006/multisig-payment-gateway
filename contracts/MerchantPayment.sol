
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MerchantPayment is ReentrancyGuard {

    IERC20 public immutable stablecoin;

    address public owner;

    uint256 public nextInvoiceId;

    struct Invoice {
        address merchant;
        uint256 amount;
        bool paid;
    }

    mapping(uint256 => Invoice) public invoices;

    event InvoiceCreated(
        uint256 indexed invoiceId,
        address indexed merchant,
        uint256 amount
    );

    event PaymentReceived(
        uint256 indexed invoiceId,
        address indexed customer,
        address indexed merchant,
        uint256 amount
    );

    constructor(address _stablecoin) {
        require(_stablecoin != address(0), "Invalid token address");

        stablecoin = IERC20(_stablecoin);
        owner = msg.sender;
    }

    function createInvoice(
        uint256 amount
    ) external returns (uint256) {

        require(amount > 0, "Amount must be greater than zero");

        uint256 invoiceId = nextInvoiceId++;

        invoices[invoiceId] = Invoice({
            merchant: msg.sender,
            amount: amount,
            paid: false
        });

        emit InvoiceCreated(
            invoiceId,
            msg.sender,
            amount
        );

        return invoiceId;
    }

    function payInvoice(
        uint256 invoiceId
    ) external nonReentrant {

        Invoice storage invoice = invoices[invoiceId];

        require(invoice.amount > 0, "Invoice does not exist");
        require(!invoice.paid, "Invoice already paid");
        require(msg.sender != invoice.merchant, "Merchant cannot pay own invoice");

        invoice.paid = true;

        bool success = stablecoin.transferFrom(
            msg.sender,
            invoice.merchant,
            invoice.amount
        );

        require(success, "Payment failed");

        emit PaymentReceived(
            invoiceId,
            msg.sender,
            invoice.merchant,
            invoice.amount
        );
    }
}
