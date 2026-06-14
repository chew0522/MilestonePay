// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol"; // so that this contract has an owner 
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; // prevent a specific type of attack 

contract MilestonePay is Ownable, ReentrancyGuard {
    // ============ STATE ============

    enum ProjectState { Active, Disputed, Completed, Cancelled } // name state instead of using number 

    struct Milestone {
        string description;
        uint amount;
        bool isCompleted;
        bool isApproved;
    }

    struct Project {
        address client;
        address freelancer;
        uint totalAmount;
        uint milestoneCount;
        uint completedMilestones;
        ProjectState state;
    }

    mapping(uint => Project) public projects;
    mapping(uint => mapping(uint => Milestone)) public milestones;
    mapping(address => uint[]) public userProjects;
    uint public nextProjectId; // counter 

    // ============ EVENTS ============
    // like announcement, eg when project created, milestone approve, fronted update the screen
    event ProjectCreated(uint indexed projectId, address indexed client, address indexed freelancer, uint totalAmount, uint milestoneCount);
    event MilestoneCompleted(uint indexed projectId, uint indexed milestoneId);
    event MilestoneApproved(uint indexed projectId, uint indexed milestoneId, uint amount);
    event MilestoneRejected(uint indexed projectId, uint indexed milestoneId);
    event DisputeRaised(uint indexed projectId);
    event DisputeResolved(uint indexed projectId, bool refunded);
    event ProjectCancelled(uint indexed projectId);
    event FundsDeposited(uint indexed projectId, uint amount);

    // ============ CONSTRUCTOR ============

    constructor() Ownable(msg.sender) {} // who deploy the contract will become the owner 

    // ============ MODIFIERS ============

    modifier onlyClient(uint _projectId) { // check client 
        require(msg.sender == projects[_projectId].client, "Not the client");
        _;
    }

    modifier onlyFreelancer(uint _projectId) { // check freelancer 
        require(msg.sender == projects[_projectId].freelancer, "Not the freelancer");
        _;
    }

    modifier onlyProjectParticipant(uint _projectId) { // check project participant 
        Project storage project = projects[_projectId];
        require(msg.sender == project.client || msg.sender == project.freelancer, "Not a participant");
        _;
    }

    modifier inState(uint _projectId, ProjectState _state) { // check project status 
        require(projects[_projectId].state == _state, "Invalid project state");
        _;
    }

    // ============ FUNCTIONS ============

    /// @notice Client creates a project with milestones and deposits ETH
    function createProject(
        address _freelancer,
        uint _milestoneCount,
        string[] calldata _milestoneDescriptions,
        uint[] calldata _milestonePercentages
    ) external payable returns (uint projectId) {
        require(_freelancer != address(0), "Invalid freelancer address");
        require(_freelancer != msg.sender, "Cannot be your own freelancer");
        require(_milestoneCount > 0, "Need at least 1 milestone");
        require(_milestoneCount <= 20, "Max 20 milestones");
        require(_milestoneCount == _milestoneDescriptions.length, "Descriptions count mismatch");
        require(_milestoneCount == _milestonePercentages.length, "Percentages count mismatch");
        require(msg.value > 0, "Must deposit funds");

        // Validate percentages sum to 100
        uint totalPercentage;
        for (uint i = 0; i < _milestoneCount; i++) {
            require(_milestonePercentages[i] > 0, "Percentage must be > 0");
            totalPercentage += _milestonePercentages[i];
        }
        require(totalPercentage == 100, "Percentages must sum to 100");

        projectId = nextProjectId;
        nextProjectId++;

        Project storage project = projects[projectId];
        project.client = msg.sender;
        project.freelancer = _freelancer;
        project.totalAmount = msg.value;
        project.milestoneCount = _milestoneCount;
        project.state = ProjectState.Active;

        // Create milestones with calculated amounts
        for (uint i = 0; i < _milestoneCount; i++) {
            uint milestoneAmount = (msg.value * _milestonePercentages[i]) / 100;
            milestones[projectId][i] = Milestone({
                description: _milestoneDescriptions[i],
                amount: milestoneAmount,
                isCompleted: false,
                isApproved: false
            });
        }

        userProjects[msg.sender].push(projectId);  // add to client's list 
        userProjects[_freelancer].push(projectId);  // add to freelancer's list

        emit ProjectCreated(projectId, msg.sender, _freelancer, msg.value, _milestoneCount);
    }

    /// @notice Freelancer marks a milestone as completed
    function completeMilestone(uint _projectId, uint _milestoneId)
        external
        onlyFreelancer(_projectId)
        inState(_projectId, ProjectState.Active)
    {
        Milestone storage milestone = milestones[_projectId][_milestoneId];
        require(_milestoneId < projects[_projectId].milestoneCount, "Invalid milestone");
        require(!milestone.isCompleted, "Already completed");

        milestone.isCompleted = true;
        emit MilestoneCompleted(_projectId, _milestoneId);
    }

    /// @notice Client approves a completed milestone and releases payment to freelancer
    function approveMilestone(uint _projectId, uint _milestoneId)
        external
        onlyClient(_projectId)
        inState(_projectId, ProjectState.Active)
        nonReentrant
    {
        Project storage project = projects[_projectId];
        Milestone storage milestone = milestones[_projectId][_milestoneId];
        require(_milestoneId < project.milestoneCount, "Invalid milestone");
        require(milestone.isCompleted, "Milestone not completed");
        require(!milestone.isApproved, "Already approved");

        milestone.isApproved = true;
        project.completedMilestones++;

        // Transfer milestone payment to freelancer
        uint payment = milestone.amount;
        payable(project.freelancer).transfer(payment);

        // Check if all milestones are done
        if (project.completedMilestones == project.milestoneCount) {
            project.state = ProjectState.Completed;

            // Refund any remaining dust to client
            uint balance = address(this).balance;
            if (balance > 0) {
                payable(project.client).transfer(balance);
            }
        }

        emit MilestoneApproved(_projectId, _milestoneId, payment);
    }

    /// @notice Client rejects a milestone (freelancer needs to redo)
    function rejectMilestone(uint _projectId, uint _milestoneId)
        external
        onlyClient(_projectId)
        inState(_projectId, ProjectState.Active)
    {
        Milestone storage milestone = milestones[_projectId][_milestoneId];
        require(_milestoneId < projects[_projectId].milestoneCount, "Invalid milestone");
        require(milestone.isCompleted, "Milestone not completed");
        require(!milestone.isApproved, "Already approved");

        milestone.isCompleted = false;  // Reset so freelancer can resubmit
        emit MilestoneRejected(_projectId, _milestoneId);
    }

    /// @notice Either party can raise a dispute
    function raiseDispute(uint _projectId)
        external
        onlyProjectParticipant(_projectId)
        inState(_projectId, ProjectState.Active)
    {
        projects[_projectId].state = ProjectState.Disputed;
        emit DisputeRaised(_projectId);
    }

    /// @notice Owner (admin) resolves a dispute — decides to pay freelancer or refund client
    function resolveDispute(uint _projectId, bool _payFreelancer)
        external
        onlyOwner
        inState(_projectId, ProjectState.Disputed)
        nonReentrant
    {
        Project storage project = projects[_projectId];
        project.state = ProjectState.Completed;

        uint balance = address(this).balance;

        if (_payFreelancer) {
            payable(project.freelancer).transfer(balance);
        } else {
            payable(project.client).transfer(balance);
        }

        emit DisputeResolved(_projectId, !_payFreelancer);
    }

    /// @notice Client can cancel an active project (no milestones completed)
    function cancelProject(uint _projectId)
        external
        onlyClient(_projectId)
        inState(_projectId, ProjectState.Active)
        nonReentrant
    {
        Project storage project = projects[_projectId];
        require(project.completedMilestones == 0, "Cannot cancel, milestones completed");

        project.state = ProjectState.Cancelled;
        payable(project.client).transfer(address(this).balance);

        emit ProjectCancelled(_projectId);
    }

    // ============ VIEW FUNCTIONS ============

    function getProject(uint _projectId) external view returns (
        address client,
        address freelancer,
        uint totalAmount,
        uint milestoneCount,
        uint completedMilestones,
        ProjectState state
    ) {
        Project storage project = projects[_projectId];
        return (
            project.client,
            project.freelancer,
            project.totalAmount,
            project.milestoneCount,
            project.completedMilestones,
            project.state
        );
    }

    function getUserProjects(address _user) external view returns (uint[] memory) {
        return userProjects[_user];
    }

    function getProjectCount(address _user) external view returns (uint) {
        return userProjects[_user].length;
    }
}
