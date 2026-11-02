
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MultiSigWallet {

    address[] public owners;

    uint256 public requiredApprovals;

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 approvalCount;
    }

    Transaction[] public transactions;

    mapping(uint256 => mapping(address => bool))
        public approved;

    event Deposit(
        address indexed sender,
        uint256 amount
    );

    event TransactionSubmitted(
        uint256 indexed transactionId,
        address indexed submitter,
        address to,
        uint256 value
    );

    event TransactionApproved(
        uint256 indexed transactionId,
        address indexed owner
    );

    event TransactionExecuted(
        uint256 indexed transactionId
    );

    modifier onlyOwner() {
        bool isOwner = false;

        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == msg.sender) {
                isOwner = true;
                break;
            }
        }

        require(isOwner, "Not an authorized owner");
        _;
    }

    constructor(
        address[] memory _owners,
        uint256 _requiredApprovals
    ) {
        require(_owners.length >= 2, "At least 2 owners required");

        require(
            _requiredApprovals > 0 &&
            _requiredApprovals <= _owners.length,
            "Invalid approval threshold"
        );

        for (uint256 i = 0; i < _owners.length; i++) {

            address currentOwner = _owners[i];

            require(
                currentOwner != address(0),
                "Invalid owner address"
            );

            for (uint256 j = 0; j < i; j++) {
                require(
                    _owners[j] != currentOwner,
                    "Duplicate owner"
                );
            }

            owners.push(currentOwner);
        }

        requiredApprovals = _requiredApprovals;
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    function submitTransaction(
        address _to,
        uint256 _value,
        bytes memory _data
    ) external onlyOwner {

        require(_to != address(0), "Invalid recipient");

        uint256 transactionId = transactions.length;

        transactions.push(
            Transaction({
                to: _to,
                value: _value,
                data: _data,
                executed: false,
                approvalCount: 0
            })
        );

        emit TransactionSubmitted(
            transactionId,
            msg.sender,
            _to,
            _value
        );
    }

    function approveTransaction(
        uint256 _transactionId
    ) external onlyOwner {

        require(
            _transactionId < transactions.length,
            "Transaction does not exist"
        );

        Transaction storage transaction =
            transactions[_transactionId];

        require(!transaction.executed, "Already executed");

        require(
            !approved[_transactionId][msg.sender],
            "Already approved"
        );

        approved[_transactionId][msg.sender] = true;

        transaction.approvalCount++;

        emit TransactionApproved(
            _transactionId,
            msg.sender
        );
    }

    function executeTransaction(
        uint256 _transactionId
    ) external onlyOwner {

        require(
            _transactionId < transactions.length,
            "Transaction does not exist"
        );

        Transaction storage transaction =
            transactions[_transactionId];

        require(!transaction.executed, "Already executed");

        require(
            transaction.approvalCount >= requiredApprovals,
            "Not enough approvals"
        );

        transaction.executed = true;

        (bool success, ) = transaction.to.call{
            value: transaction.value
        }(transaction.data);

        require(success, "Transaction execution failed");

        emit TransactionExecuted(_transactionId);
    }

    function getTransactionCount()
        external
        view
        returns (uint256)
    {
        return transactions.length;
    }

    function getOwners()
        external
        view
        returns (address[] memory)
    {
        return owners;
    }

    function getTransaction(
        uint256 _transactionId
    )
        external
        view
        returns (
            address to,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 approvalCount
        )
    {
        require(
            _transactionId < transactions.length,
            "Transaction does not exist"
        );

        Transaction storage transaction =
            transactions[_transactionId];

        return (
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.executed,
            transaction.approvalCount
        );
    }
}
