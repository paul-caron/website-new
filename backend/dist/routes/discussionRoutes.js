"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const discussionController_1 = __importDefault(require("../controllers/discussionController"));
const verifyJWT_1 = __importDefault(require("../middleware/verifyJWT"));
const protectRoute_1 = __importDefault(require("../middleware/protectRoute"));
const requestLimiter_1 = __importDefault(require("../middleware/requestLimiter"));
const router = express_1.default.Router();
router.use(verifyJWT_1.default);
router.route("/")
    .get(discussionController_1.default.getQuestionList);
router.route("/:questionId")
    .get(discussionController_1.default.getQuestion);
router.route("/:questionId/GetReplies")
    .get(discussionController_1.default.getReplies);
router.route("/GetTags")
    .get(discussionController_1.default.getTags);
router.route("/GetCodeComments")
    .post(discussionController_1.default.getCodeComments);
router.use(protectRoute_1.default);
router.route("/CreateQuestion")
    .post(discussionController_1.default.createQuestion);
router.route("/EditQuestion")
    .put(discussionController_1.default.editQuestion);
router.route("/DeleteQuestion")
    .delete(discussionController_1.default.deleteQuestion);
router.route("/CreateReply")
    .post(discussionController_1.default.createReply);
router.route("/EditReply")
    .put(discussionController_1.default.editReply);
router.route("/DeleteReply")
    .delete(discussionController_1.default.deleteReply);
router.route("/ToggleAcceptedAnswer")
    .post(discussionController_1.default.toggleAcceptedAnswer);
router.route("/VotePost")
    .post(discussionController_1.default.votePost);
router.route("/CreateCodeComment")
    .post((0, requestLimiter_1.default)(10 * 60, 20, "Too many requests, try again later"), discussionController_1.default.createCodeComment);
router.route("/EditCodeComment")
    .put(discussionController_1.default.editCodeComment);
router.route("/DeleteCodeComment")
    .delete(discussionController_1.default.deleteCodeComment);
router.route("/FollowQuestion")
    .post(discussionController_1.default.followQuestion);
router.route("/UnfollowQuestion")
    .post(discussionController_1.default.unfollowQuestion);
exports.default = router;
