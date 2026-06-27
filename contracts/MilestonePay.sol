// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol"; // role-based access control
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; // prevent a specific type of attack 

contract MilestonePay is AccessControl, ReentrancyGuard {
    bytes32 public constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");
    bytes32 public constant TECHNICAL_STAFF_ROLE = keccak256("TECHNICAL_STAFF_ROLE");
    // ============ STATE ============

    enum ProjectState { Active, Disputed, Completed, Cancelled } // name state instead of using number 

    struct Milestone {
        string description;
        uint amount;
        bool isCompleted;
        bool isApproved;
        string rejectionReason;
        bool isDisputed;
        string submissionDetail;
    }

    struct Project {
        address client;
        address freelancer;
        uint totalAmount;
        uint milestoneCount;
        uint completedMilestones;
        ProjectState state;
        uint escrowBalance;
        string title;
        string description;
        uint createdAt;
        uint deadline;
    }

    mapping(uint => Project) public projects;
    mapping(uint => mapping(uint => Milestone)) public milestones;
    mapping(address => uint[]) public userProjects;
    uint public nextProjectId; // counter 

    address public arbitrator1;
    address public arbitrator2;
    address public arbitrator3;
    uint public accumulatedFees;
    mapping(uint => uint) public projectArbitratorFees;

    struct TechnicalReview {
        address staff;
        string report;
        bool recommendedPass;
        bool isSubmitted;
    }

    mapping(uint => mapping(uint => TechnicalReview)) public milestoneReviews;
    mapping(uint => mapping(uint => bool)) public reviewRequested;
    mapping(uint => mapping(uint => bool)) public clientDisputed;
    mapping(uint => mapping(uint => bool)) public freelancerDisputed;

    // Dispute voting variables on milestone level
    mapping(uint => mapping(uint => uint)) public payFreelancerVotes;
    mapping(uint => mapping(uint => uint)) public refundClientVotes;
    mapping(uint => mapping(uint => mapping(address => bool))) public hasVotedOnDispute;

    // ============ EVENTS ============
    // like announcement, eg when project created, milestone approve, fronted update the screen
    event ProjectCreated(uint indexed projectId, address indexed client, address indexed freelancer, uint totalAmount, uint milestoneCount);
    event ProjectClaimed(uint indexed projectId, address indexed freelancer);
    event MilestoneCompleted(uint indexed projectId, uint indexed milestoneId);
    event MilestoneApproved(uint indexed projectId, uint indexed milestoneId, uint amount);
    event MilestoneRejected(uint indexed projectId, uint indexed milestoneId, string reason);
    event DisputeRaised(uint indexed projectId, uint indexed milestoneId);
    event DisputeResolved(uint indexed projectId, uint indexed milestoneId, bool refunded);
    event ProjectCancelled(uint indexed projectId, uint clientRefund, uint freelancerPayout);
    event FundsDeposited(uint indexed projectId, uint amount);
    event FeesWithdrawn(uint amount, uint sharePerAdmin);
    event TechnicalReviewRequested(uint indexed projectId, uint indexed milestoneId, address indexed requester);
    event TechnicalReviewSubmitted(uint indexed projectId, uint indexed milestoneId, address indexed staff, bool recommendedPass, string report);
    event DisputeVoteCast(uint indexed projectId, uint indexed milestoneId, address indexed arbitrator, bool payFreelancer);
    event AuditorFeePaid(uint indexed projectId, uint indexed milestoneId, address indexed auditor, uint amount);

    // ============ CONSTRUCTOR ============

    constructor(address _admin1, address _admin2, address _admin3) {
        require(_admin1 != address(0) && _admin2 != address(0) && _admin3 != address(0), "Invalid admin address");
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ARBITRATOR_ROLE, _admin1);
        _grantRole(ARBITRATOR_ROLE, _admin2);
        _grantRole(ARBITRATOR_ROLE, _admin3);

        arbitrator1 = _admin1;
        arbitrator2 = _admin2;
        arbitrator3 = _admin3;
    }

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

    /// @notice Client creates a project with milestones and deposits ETH (default 30 days deadline)
    function createProject(
        address _freelancer,
        string calldata _title,
        string calldata _description,
        uint _milestoneCount,
        string[] calldata _milestoneDescriptions,
        uint[] calldata _milestonePercentages
    ) external payable returns (uint projectId) {
        return _createProjectInternal(
            _freelancer,
            _title,
            _description,
            _milestoneCount,
            _milestoneDescriptions,
            _milestonePercentages,
            block.timestamp + 30 days
        );
    }

    /// @notice Client creates a project with milestones, custom deadline, and deposits ETH
    function createProjectWithDeadline(
        address _freelancer,
        string calldata _title,
        string calldata _description,
        uint _milestoneCount,
        string[] calldata _milestoneDescriptions,
        uint[] calldata _milestonePercentages,
        uint _deadline
    ) external payable returns (uint projectId) {
        require(_deadline > block.timestamp, "Deadline must be in the future");
        return _createProjectInternal(
            _freelancer,
            _title,
            _description,
            _milestoneCount,
            _milestoneDescriptions,
            _milestonePercentages,
            _deadline
        );
    }

    function _createProjectInternal(
        address _freelancer,
        string calldata _title,
        string calldata _description,
        uint _milestoneCount,
        string[] calldata _milestoneDescriptions,
        uint[] calldata _milestonePercentages,
        uint _deadline
    ) internal returns (uint projectId) {
        if (_freelancer != address(0)) {
            require(_freelancer != msg.sender, "Cannot be your own freelancer");
        }
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
        project.escrowBalance = msg.value;
        project.title = _title;
        project.description = _description;
        project.createdAt = block.timestamp;
        project.deadline = _deadline;

        // Create milestones with calculated amounts
        for (uint i = 0; i < _milestoneCount; i++) {
            uint milestoneAmount = (msg.value * _milestonePercentages[i]) / 100;
            milestones[projectId][i] = Milestone({
                description: _milestoneDescriptions[i],
                amount: milestoneAmount,
                isCompleted: false,
                isApproved: false,
                rejectionReason: "",
                isDisputed: false,
                submissionDetail: ""
            });
        }

        userProjects[msg.sender].push(projectId);  // add to client's list 
        if (_freelancer != address(0)) {
            userProjects[_freelancer].push(projectId);  // add to freelancer's list
        }

        emit ProjectCreated(projectId, msg.sender, _freelancer, msg.value, _milestoneCount);
    }

    /// @notice Freelancer claims an open project
    function claimProject(uint _projectId)
        external
        inState(_projectId, ProjectState.Active)
    {
        Project storage project = projects[_projectId];
        require(project.freelancer == address(0), "Project already claimed");
        require(msg.sender != project.client, "Client cannot be the freelancer");

        project.freelancer = msg.sender;
        userProjects[msg.sender].push(_projectId); // Add to freelancer's list

        emit ProjectClaimed(_projectId, msg.sender);
    }

    /// @notice Freelancer marks a milestone as completed without details (backwards compatible)
    function completeMilestone(uint _projectId, uint _milestoneId)
        external
    {
        completeMilestone(_projectId, _milestoneId, "");
    }

    /// @notice Freelancer marks a milestone as completed with submission details
    function completeMilestone(
        uint _projectId,
        uint _milestoneId,
        string memory _submissionDetail
    )
        public
        onlyFreelancer(_projectId)
        inState(_projectId, ProjectState.Active)
    {
        Milestone storage milestone = milestones[_projectId][_milestoneId];
        require(_milestoneId < projects[_projectId].milestoneCount, "Invalid milestone");
        require(!milestone.isCompleted, "Already completed");

        milestone.isCompleted = true;
        milestone.rejectionReason = ""; // Clear reason on resubmit
        milestone.submissionDetail = _submissionDetail;
        emit MilestoneCompleted(_projectId, _milestoneId);
    }

    /// @notice Client approves a completed milestone and releases payment to freelancer (3% fee deducted)
    function approveMilestone(uint _projectId, uint _milestoneId)
        external
        payable
        onlyClient(_projectId)
        inState(_projectId, ProjectState.Active)
        nonReentrant
    {
        Project storage project = projects[_projectId];
        Milestone storage milestone = milestones[_projectId][_milestoneId];
        require(_milestoneId < project.milestoneCount, "Invalid milestone");
        require(milestone.isCompleted, "Milestone not completed");
        require(!milestone.isApproved, "Already approved");

        uint payment = milestone.amount;

        if (project.escrowBalance < payment) {
            require(msg.value == payment, "Must deposit milestone funds to approve");
            project.escrowBalance += msg.value;
        }

        milestone.isApproved = true;
        project.completedMilestones++;

        // Calculate and deduct platform fee (3%)
        uint fee = (payment * 3) / 100;
        uint netPayment = payment - fee;

        project.escrowBalance -= payment;

        bool hasAudit = milestoneReviews[_projectId][_milestoneId].isSubmitted;
        if (hasAudit) {
            address auditor = milestoneReviews[_projectId][_milestoneId].staff;
            uint auditorFee = (payment * 25) / 10000;
            projectArbitratorFees[_projectId] += (fee - auditorFee);
            payable(auditor).transfer(auditorFee);
            emit AuditorFeePaid(_projectId, _milestoneId, auditor, auditorFee);
        } else {
            projectArbitratorFees[_projectId] += fee;
        }

        payable(project.freelancer).transfer(netPayment);

        // Check if all milestones are done
        if (project.completedMilestones == project.milestoneCount) {
            _completeProject(_projectId);
        }

        emit MilestoneApproved(_projectId, _milestoneId, netPayment);
    }

    /// @notice Client rejects a milestone (freelancer needs to redo)
    function rejectMilestone(uint _projectId, uint _milestoneId, string calldata _reason)
        external
        onlyClient(_projectId)
        inState(_projectId, ProjectState.Active)
    {
        Milestone storage milestone = milestones[_projectId][_milestoneId];
        require(_milestoneId < projects[_projectId].milestoneCount, "Invalid milestone");
        require(milestone.isCompleted, "Milestone not completed");
        require(!milestone.isApproved, "Already approved");

        milestone.isCompleted = false;  // Reset so freelancer can resubmit
        milestone.rejectionReason = _reason;
        emit MilestoneRejected(_projectId, _milestoneId, _reason);
    }

    /// @notice Either party can raise a dispute on a specific milestone
    function raiseDispute(uint _projectId, uint _milestoneId)
        external
        onlyProjectParticipant(_projectId)
        inState(_projectId, ProjectState.Active)
    {
        Project storage project = projects[_projectId];
        require(_milestoneId < project.milestoneCount, "Invalid milestone");
        Milestone storage milestone = milestones[_projectId][_milestoneId];
        require(!milestone.isApproved, "Milestone already approved");
        require(!milestone.isDisputed, "Milestone already disputed");

        if (msg.sender == project.client) {
            require(milestone.isCompleted, "Milestone not completed yet");
            require(!clientDisputed[_projectId][_milestoneId], "Client already disputed this milestone");
            clientDisputed[_projectId][_milestoneId] = true;
        } else if (msg.sender == project.freelancer) {
            require(bytes(milestone.rejectionReason).length > 0, "Milestone must be rejected first");
            require(!freelancerDisputed[_projectId][_milestoneId], "Freelancer already disputed this milestone");
            freelancerDisputed[_projectId][_milestoneId] = true;
        } else {
            revert("Not a participant");
        }

        milestone.isDisputed = true;
        milestone.isCompleted = true; // Ensure completed state during dispute for voting/audit flows
        emit DisputeRaised(_projectId, _milestoneId);
    }

    /// @notice Arbitrator votes to resolve a milestone dispute — decision is executed once all 3 vote
    function resolveDispute(uint _projectId, uint _milestoneId, bool _payFreelancer)
        external
        onlyRole(ARBITRATOR_ROLE)
        inState(_projectId, ProjectState.Active)
        nonReentrant
    {
        Project storage project = projects[_projectId];
        require(_milestoneId < project.milestoneCount, "Invalid milestone");
        Milestone storage milestone = milestones[_projectId][_milestoneId];
        require(milestone.isDisputed, "Milestone is not disputed");
        require(!hasVotedOnDispute[_projectId][_milestoneId][msg.sender], "Already voted on this dispute");

        hasVotedOnDispute[_projectId][_milestoneId][msg.sender] = true;

        if (_payFreelancer) {
            payFreelancerVotes[_projectId][_milestoneId]++;
        } else {
            refundClientVotes[_projectId][_milestoneId]++;
        }

        emit DisputeVoteCast(_projectId, _milestoneId, msg.sender, _payFreelancer);

        uint totalVotes = payFreelancerVotes[_projectId][_milestoneId] + refundClientVotes[_projectId][_milestoneId];
        if (totalVotes == 3) {
            milestone.isDisputed = false;

            uint milestoneAmount = milestone.amount;
            project.escrowBalance -= milestoneAmount;

            if (payFreelancerVotes[_projectId][_milestoneId] >= 2) {
                milestone.isApproved = true;
                project.completedMilestones++;
                
                uint fee = (milestoneAmount * 3) / 100;
                uint netPayment = milestoneAmount - fee;

                bool hasAudit = milestoneReviews[_projectId][_milestoneId].isSubmitted;
                if (hasAudit) {
                    address auditor = milestoneReviews[_projectId][_milestoneId].staff;
                    uint auditorFee = (milestoneAmount * 25) / 10000;
                    projectArbitratorFees[_projectId] += (fee - auditorFee);
                    payable(auditor).transfer(auditorFee);
                    emit AuditorFeePaid(_projectId, _milestoneId, auditor, auditorFee);
                } else {
                    projectArbitratorFees[_projectId] += fee;
                }

                payable(project.freelancer).transfer(netPayment);
                emit DisputeResolved(_projectId, _milestoneId, false); // refunded: false
            } else {
                milestone.isCompleted = false;
                milestone.isApproved = false;
                milestone.rejectionReason = "Dispute resolved: Refunded to client";
                
                payable(project.client).transfer(milestoneAmount);

                bool hasAudit = milestoneReviews[_projectId][_milestoneId].isSubmitted;
                if (hasAudit) {
                    address auditor = milestoneReviews[_projectId][_milestoneId].staff;
                    uint auditorFee = (milestoneAmount * 25) / 10000;
                    if (projectArbitratorFees[_projectId] >= auditorFee) {
                        projectArbitratorFees[_projectId] -= auditorFee;
                    } else {
                        uint deficit = auditorFee - projectArbitratorFees[_projectId];
                        projectArbitratorFees[_projectId] = 0;
                        if (accumulatedFees >= deficit) {
                            accumulatedFees -= deficit;
                        } else {
                            accumulatedFees = 0;
                        }
                    }
                    payable(auditor).transfer(auditorFee);
                    emit AuditorFeePaid(_projectId, _milestoneId, auditor, auditorFee);
                }

                delete milestoneReviews[_projectId][_milestoneId];
                reviewRequested[_projectId][_milestoneId] = false;

                emit DisputeResolved(_projectId, _milestoneId, true); // refunded: true
            }

            // Reset voting state for this milestone
            payFreelancerVotes[_projectId][_milestoneId] = 0;
            refundClientVotes[_projectId][_milestoneId] = 0;
            hasVotedOnDispute[_projectId][_milestoneId][arbitrator1] = false;
            hasVotedOnDispute[_projectId][_milestoneId][arbitrator2] = false;
            hasVotedOnDispute[_projectId][_milestoneId][arbitrator3] = false;

            // Check if all milestones are finalized (approved or resolved)
            if (project.completedMilestones == project.milestoneCount) {
                _completeProject(_projectId);
            }
        }
    }

    /// @notice Client can cancel an active project (no milestones completed, or deadline has passed with no active disputes)
    function cancelProject(uint _projectId)
        external
        onlyClient(_projectId)
        inState(_projectId, ProjectState.Active)
        nonReentrant
    {
        Project storage project = projects[_projectId];
        
        // Ensure no milestones are disputed
        for (uint i = 0; i < project.milestoneCount; i++) {
            require(!milestones[_projectId][i].isDisputed, "Cannot cancel: milestone is disputed");
        }

        // If any milestone has been approved, ensure the deadline has passed
        if (project.completedMilestones > 0) {
            require(block.timestamp > project.deadline, "Deadline has not passed");
        }

        project.state = ProjectState.Cancelled;
        uint refund = project.escrowBalance;
        project.escrowBalance = 0;
        payable(project.client).transfer(refund);

        emit ProjectCancelled(_projectId, refund, 0);
    }

    // ============ VIEW FUNCTIONS ============

    function getProject(uint _projectId) external view returns (
        address client,
        address freelancer,
        uint totalAmount,
        uint milestoneCount,
        uint completedMilestones,
        ProjectState state,
        uint escrowBalance,
        string memory title,
        string memory description,
        uint createdAt,
        uint deadline
    ) {
        Project storage project = projects[_projectId];
        return (
            project.client,
            project.freelancer,
            project.totalAmount,
            project.milestoneCount,
            project.completedMilestones,
            project.state,
            project.escrowBalance,
            project.title,
            project.description,
            project.createdAt,
            project.deadline
        );
    }

    function getUserProjects(address _user) external view returns (uint[] memory) {
        return userProjects[_user];
    }

    function getProjectCount(address _user) external view returns (uint) {
        return userProjects[_user].length;
    }

    /// @notice Any arbitrator can call this to trigger withdrawal of their 1/3 share of accumulated fees.
    function withdrawFees() external onlyRole(ARBITRATOR_ROLE) nonReentrant {
        uint total = accumulatedFees;
        require(total > 0, "No fees to withdraw");

        uint share = total / 3;
        require(share > 0, "Share too small");

        accumulatedFees = total - (share * 3); // Retain any remainder dust in contract

        payable(arbitrator1).transfer(share);
        payable(arbitrator2).transfer(share);
        payable(arbitrator3).transfer(share);

        emit FeesWithdrawn(total - accumulatedFees, share);
    }

    /// @notice Request technical staff to review the disputed milestone
    function requestTechnicalReview(uint _projectId, uint _milestoneId)
        external
        onlyProjectParticipant(_projectId)
        inState(_projectId, ProjectState.Active)
    {
        Project storage project = projects[_projectId];
        require(_milestoneId < project.milestoneCount, "Invalid milestone");
        Milestone storage milestone = milestones[_projectId][_milestoneId];
        require(milestone.isDisputed, "Milestone is not disputed");
        require(!reviewRequested[_projectId][_milestoneId], "Review already requested");

        reviewRequested[_projectId][_milestoneId] = true;
        emit TechnicalReviewRequested(_projectId, _milestoneId, msg.sender);
    }

    /// @notice Technical staff submits their audit report and recommendation on the milestone
    function submitAuditReport(
        uint _projectId,
        uint _milestoneId,
        string calldata _report,
        bool _recommendedPass
    )
        external
        onlyRole(TECHNICAL_STAFF_ROLE)
        inState(_projectId, ProjectState.Active)
    {
        Project storage project = projects[_projectId];
        require(_milestoneId < project.milestoneCount, "Invalid milestone");
        Milestone storage milestone = milestones[_projectId][_milestoneId];
        require(milestone.isDisputed, "Milestone is not disputed");
        require(reviewRequested[_projectId][_milestoneId], "Review not requested");
        require(!milestoneReviews[_projectId][_milestoneId].isSubmitted, "Review already submitted");

        milestoneReviews[_projectId][_milestoneId] = TechnicalReview({
            staff: msg.sender,
            report: _report,
            recommendedPass: _recommendedPass,
            isSubmitted: true
        });

        emit TechnicalReviewSubmitted(_projectId, _milestoneId, msg.sender, _recommendedPass, _report);
    }

    function _completeProject(uint _projectId) private {
        Project storage project = projects[_projectId];
        project.state = ProjectState.Completed;

        // Refund any remaining dust to client
        uint refund = project.escrowBalance;
        project.escrowBalance = 0;
        if (refund > 0) {
            payable(project.client).transfer(refund);
        }

        // Distribute project arbitrator fees to the 3 arbitrators
        uint totalProjFee = projectArbitratorFees[_projectId];
        projectArbitratorFees[_projectId] = 0;
        uint share = totalProjFee / 3;
        if (share > 0) {
            payable(arbitrator1).transfer(share);
            payable(arbitrator2).transfer(share);
            payable(arbitrator3).transfer(share);
            // Any remainder dust goes to global accumulatedFees
            accumulatedFees += (totalProjFee - (share * 3));
        }
    }
}
