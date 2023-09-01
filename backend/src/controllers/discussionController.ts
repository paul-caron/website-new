import { IAuthRequest } from "../middleware/verifyJWT";
import { Response } from "express";
import asyncHandler from "express-async-handler";
import Post from "../models/Post";
import Tag from "../models/Tag";
import Upvote from "../models/Upvote";
import Code from "../models/Code";

const createQuestion = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { title, message, tags } = req.body;
    const currentUserId = req.userId;

    if (typeof title === "undefined" || typeof message === "undefined" || typeof tags === "undefined") {
        res.status(400).json({ message: "Some fields are missing" });
        return
    }

    const tagIds: any[] = [];
    let promises: Promise<void>[] = [];

    for (let tagName of tags) {
        promises.push(Tag.getOrCreateTagByName(tagName)
            .then(tag => {
                tagIds.push(tag._id);
            })
        )
    }

    await Promise.all(promises);

    const question = await Post.create({
        _type: 1,
        title,
        message,
        tags: tagIds,
        user: currentUserId
    })

    if (question) {
        res.json({
            question: {
                id: question._id,
                title: question.title,
                message: question.message,
                tags: question.tags,
                date: question.createdAt,
                userId: question.user,
                isAccepted: question.isAccepted,
                votes: question.votes,
                answers: question.answers
            }
        });
    }
    else {
        res.status(500).json({ message: "Error" });
    }

});

const getQuestionList = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const query = req.query;
    const currentUserId = req.userId;

    const page = Number(query.page);
    const count = Number(query.count);
    const filter = Number(query.filter);
    const searchQuery = typeof query.query !== "string" ? "" : query.query.trim();
    const userId = typeof query.profileId !== "string" ? null : query.profileId;

    if (!Number.isInteger(page) || !Number.isInteger(count) || !Number.isInteger(filter)) {
        res.status(400).json({ message: "Invalid query params" });
        return
    }

    let dbQuery = Post.find({ _type: 1 })

    if (searchQuery.length) {
        const tagIds = (await Tag.find({ name: searchQuery }))
            .map(x => x._id);
        dbQuery.where({
            $or: [
                { title: new RegExp("^" + searchQuery, "i") },
                { "tags": { $in: tagIds } }
            ]
        })
    }

    switch (filter) {
        // Most Recent
        case 1: {
            dbQuery = dbQuery
                .sort({ createdAt: "desc" })
            break;
        }
        // Unanswered
        case 2: {
            dbQuery = dbQuery
                .where({ answers: 0 })
                .sort({ createdAt: "desc" })
            break;
        }
        // My Questions
        case 3: {
            if (userId === null) {
                res.status(400).json({ message: "Invalid query params" });
                return
            }
            dbQuery = dbQuery
                .where({ user: userId })
                .sort({ createdAt: "desc" })
            break;
        }
        // My Replies
        case 4: {
            if (userId === null) {
                res.status(400).json({ message: "Invalid query params" });
                return
            }
            const replies = await Post.find({ user: userId, _type: 2 }).select("parentId");
            const questionIds = [...new Set(replies.map(x => x.parentId))];
            dbQuery = dbQuery
                .where({ _id: { $in: questionIds } })
                .sort({ createdAt: "desc" })
            break;
        }
        // Hot Today
        case 5: {
            let dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            dbQuery = dbQuery
                .where({ createdAt: { $gt: dayAgo } })
                .sort({ votes: "desc" })
            break;
        }
        default:
            throw new Error("Unknown filter");
    }

    const questionCount = await dbQuery.clone().countDocuments();

    const result = await dbQuery
        .skip((page - 1) * count)
        .limit(count)
        .select("-message")
        .populate("user", "name avatarUrl countryCode level roles")
        .populate("tags", "name") as any[];

    if (result) {
        const data = result.map(x => ({
            id: x._id,
            title: x.title,
            tags: x.tags.map((y: any) => y.name),
            date: x.createdAt,
            userId: x.user._id,
            userName: x.user.name,
            avatarUrl: x.user.avatarUrl,
            countryCode: x.user.countryCode,
            level: x.user.level,
            roles: x.user.roles,
            answers: x.answers,
            votes: x.votes,
            isUpvoted: false,
            isAccepted: x.isAccepted
        }));

        let promises = [];

        for (let i = 0; i < data.length; ++i) {
            /*promises.push(Post.countDocuments({ parentId: data[i].id }).then(count => {
                data[i].answers = count;
            }));*/
            /*promises.push(Upvote.countDocuments({ parentId: data[i].id }).then(count => {
                data[i].votes = count;
            }));*/
            if (currentUserId) {
                promises.push(Upvote.findOne({ parentId: data[i].id, user: currentUserId }).then(upvote => {
                    data[i].isUpvoted = !(upvote === null);
                }));
            }
        }

        await Promise.all(promises);

        res.status(200).json({ count: questionCount, questions: data });
    }
    else {
        res.status(500).json({ message: "Error" });
    }

});

const getQuestion = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const currentUserId = req.userId;
    const questionId = req.params.questionId;

    const question = await Post.findById(questionId)
        .populate("user", "name avatarUrl countryCode level roles")
        .populate("tags", "name") as any;

    if (question) {

        //const answers = await Post.countDocuments({ parentId: questionId });
        //const votes = await Upvote.countDocuments({ parentId: questionId });
        const isUpvoted = currentUserId ? await Upvote.findOne({ parentId: questionId, user: currentUserId }) : false;

        res.json({
            question: {
                id: question._id,
                title: question.title,
                message: question.message,
                tags: question.tags.map((y: any) => y.name),
                date: question.createdAt,
                userId: question.user._id,
                userName: question.user.name,
                avatarUrl: question.user.avatarUrl,
                countryCode: question.user.countryCode,
                level: question.user.level,
                roles: question.user.roles,
                answers: question.answers,
                votes: question.votes,
                isUpvoted,
                isAccepted: question.isAccepted
            }
        });
    }
    else {
        res.status(404).json({ message: "Question not found" })
    }
});

const createReply = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const currentUserId = req.userId;
    const { message, questionId } = req.body;

    const question = await Post.findById(questionId);
    if (question === null) {
        res.status(404).json({ message: "Question not found" });
        return
    }

    const reply = await Post.create({
        _type: 2,
        message,
        parentId: questionId,
        user: currentUserId
    })

    if (reply) {

        question.answers += 1;
        await question.save();

        res.json({
            post: {
                id: reply._id,
                message: reply.message,
                date: reply.createdAt,
                userId: reply.user,
                parentId: reply.parentId,
                isAccepted: reply.isAccepted,
                votes: reply.votes,
                answers: reply.answers
            }
        })
    }
    else {
        res.status(500).json({ message: "error" });
    }
});

const getReplies = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const currentUserId = req.userId;
    const query = req.query;
    const questionId = req.params.questionId;

    const page = Number(query.page);
    const count = Number(query.count);
    const filter = Number(query.filter);

    if (!Number.isInteger(page) || !Number.isInteger(count) || !Number.isInteger(filter)) {
        res.status(400).json({ message: "Invalid query params" });
        return
    }

    let dbQuery = Post.find({ parentId: questionId, _type: 2 });

    switch (filter) {
        // Most popular
        case 1: {
            dbQuery = dbQuery
                .sort({ votes: "desc" })
            break;
        }
        // Oldest first
        case 2: {
            dbQuery = dbQuery
                .sort({ createdAt: "asc" })
            break;
        }
        // Newest first
        case 3: {
            dbQuery = dbQuery
                .sort({ createdAt: "desc" })
            break;
        }
        default:
            throw new Error("Unknown filter");
    }

    const result = await dbQuery
        .skip((page - 1) * count)
        .limit(count)
        .populate("user", "name avatarUrl countryCode level roles") as any[];

    if (result) {
        const data = result.map(x => ({
            id: x._id,
            parentId: x.parentId,
            message: x.message,
            date: x.createdAt,
            userId: x.user._id,
            userName: x.user.name,
            avatarUrl: x.user.avatarUrl,
            countryCode: x.user.countryCode,
            level: x.user.level,
            roles: x.user.roles,
            votes: x.votes,
            isUpvoted: false,
            isAccepted: x.isAccepted,
            answers: x.answers
        }))

        let promises = [];

        for (let i = 0; i < data.length; ++i) {
            /*promises.push(Upvote.countDocuments({ parentId: data[i].id }).then(count => {
                data[i].votes = count;
            }));*/
            if (currentUserId) {
                promises.push(Upvote.findOne({ parentId: data[i].id, user: currentUserId }).then(upvote => {
                    data[i].isUpvoted = !(upvote === null);
                }));
            }
        }

        await Promise.all(promises);

        res.status(200).json({ posts: data })
    }
    else {
        res.status(500).json({ message: "Error" });
    }

});

const getTags = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { query } = req.query;

    if (typeof query !== "string") {
        res.status(400).json({ message: "Invalid query params" });
        return
    }

    if (query.length < 3) {
        res.json({ tags: [] })
    }
    else {
        const result = await Tag.find({ name: new RegExp("^" + query) });

        res.json({
            tags: result.map(x => x.name)
        })
    }
});

const toggleAcceptedAnswer = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { accepted, postId } = req.body;

    const post = await Post.findById(postId);

    if (post === null) {
        res.status(404).json({ success: false, message: "Post not found" })
        return
    }

    const question = await Post.findById(post.parentId);
    if (question === null) {
        res.status(404).json({ message: "Question not found" })
        return
    }

    if (accepted || post.isAccepted) {
        question.isAccepted = accepted;
        await question.save();
    }

    post.isAccepted = accepted;

    await post.save();

    if (accepted) {
        const currentAcceptedPost = await Post.findOne({ parentId: post.parentId, isAccepted: true, _id: { $ne: postId } });
        if (currentAcceptedPost) {
            currentAcceptedPost.isAccepted = false;

            await currentAcceptedPost.save();
        }
    }

    res.json({
        success: true,
        accepted
    });

});

const editQuestion = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const currentUserId = req.userId;

    const { questionId, title, message, tags } = req.body;

    if (typeof title === "undefined" || typeof message === "undefined" || typeof tags === "undefined") {
        res.status(400).json({ message: "Some fields are missing" });
        return
    }

    const question = await Post.findById(questionId);

    if (question === null) {
        res.status(404).json({ message: "Question not found" })
        return
    }

    if (question.user != currentUserId) {
        res.status(401).json({ message: "Unauthorized" })
        return
    }

    const tagIds: any[] = [];
    let promises: Promise<void>[] = [];

    for (let tagName of tags) {
        promises.push(Tag.getOrCreateTagByName(tagName)
            .then(tag => {
                tagIds.push(tag._id);
            })
        )
    }

    await Promise.all(promises);

    question.title = title;
    question.message = message;
    question.tags = tagIds;

    try {
        await question.save();

        res.json({
            success: true,
            data: {
                id: question._id,
                title: question.title,
                message: question.message,
                tags: question.tags
            }
        })
    }
    catch (err: any) {
        res.json({
            success: false,
            error: err,
            data: null
        });
    }

});

const deleteQuestion = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const currentUserId = req.userId;
    const { questionId } = req.body;

    const question = await Post.findById(questionId);

    if (question === null) {
        res.status(404).json({ message: "Question not found" })
        return
    }

    if (question.user != currentUserId) {
        res.status(401).json({ message: "Unauthorized" })
        return
    }

    try {
        await Post.deleteAndCleanup({ _id: questionId });

        res.json({ success: true });
    }
    catch (err: any) {
        res.json({ success: false, error: err })
    }
})

const editReply = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const currentUserId = req.userId;
    const { replyId, message } = req.body;

    if (typeof message === "undefined") {
        res.status(400).json({ message: "Some fields are missing" })
        return
    }

    const reply = await Post.findById(replyId);

    if (reply === null) {
        res.status(404).json({ message: "Post not found" })
        return
    }

    if (currentUserId != reply.user) {
        res.status(401).json({ message: "Unauthorized" });
        return
    }

    reply.message = message;

    try {
        await reply.save();

        res.json({
            success: true,
            data: {
                id: reply._id,
                message: reply.message
            }
        })
    }
    catch (err: any) {
        res.json({
            success: false,
            error: err,
            data: null
        })
    }

});

const deleteReply = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const currentUserId = req.userId;
    const { replyId } = req.body;

    const reply = await Post.findById(replyId);

    if (reply === null) {
        res.status(404).json({ message: "Post not found" })
        return
    }

    if (currentUserId != reply.user) {
        res.status(401).json({ message: "Unauthorized" });
        return
    }

    const question = await Post.findById(reply.parentId);
    if (question === null) {
        res.status(404).json({ message: "Question not found" })
        return
    }

    try {
        await Post.deleteAndCleanup({ _id: replyId });

        res.json({ success: true });
    }
    catch (err: any) {
        res.json({ success: false, error: err })
    }
})

const votePost = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const currentUserId = req.userId;
    const { postId, vote } = req.body;

    if (typeof vote === "undefined") {
        res.status(400).json({ message: "Some fields are missing" });
        return
    }

    const post = await Post.findById(postId);
    if (post === null) {
        res.status(404).json({ message: "Post not found" })
        return
    }

    let upvote = await Upvote.findOne({ parentId: postId, user: currentUserId });
    if (vote === 1) {
        if (!upvote) {
            upvote = await Upvote.create({ user: currentUserId, parentId: postId })
            post.votes += 1;
        }
    }
    else if (vote === 0) {
        if (upvote) {
            await Upvote.deleteOne({ _id: upvote._id });
            upvote = null;
            post.votes -= 1;
        }
    }

    await post.save();

    res.json({ vote: upvote ? 1 : 0 });

})

const getCodeComments = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const currentUserId = req.userId;
    const query = req.query;
    const { codeId, parentId, page, count, filter } = req.body;

    if (typeof filter === "undefined" || typeof page === "undefined" || typeof count === "undefined") {
        res.status(400).json({ message: "Some fileds are missing" });
        return
    }

    let dbQuery = Post.find({ codeId, parentId, _type: 3 });

    switch (filter) {
        // Most popular
        case 1: {
            dbQuery = dbQuery
                .sort({ votes: "desc", createdAt: "desc" })
            break;
        }
        // Oldest first
        case 2: {
            dbQuery = dbQuery
                .sort({ createdAt: "asc" })
            break;
        }
        // Newest first
        case 3: {
            dbQuery = dbQuery
                .sort({ createdAt: "desc" })
            break;
        }
        default:
            throw new Error("Unknown filter");
    }

    const result = await dbQuery
        .skip((page - 1) * count)
        .limit(count)
        .populate("user", "name avatarUrl countryCode level roles") as any[];

    if (result) {
        const data = result.map(x => ({
            id: x._id,
            parentId: x.parentId,
            codeId: x.codeId,
            message: x.message,
            date: x.createdAt,
            userId: x.user._id,
            userName: x.user.name,
            avatarUrl: x.user.avatarUrl,
            countryCode: x.user.countryCode,
            level: x.user.level,
            roles: x.user.roles,
            votes: x.votes,
            isUpvoted: false,
            isAccepted: x.isAccepted,
            answers: x.answers
        }))

        let promises = [];

        for (let i = 0; i < data.length; ++i) {
            /*promises.push(Upvote.countDocuments({ parentId: data[i].id }).then(count => {
                data[i].votes = count;
            }));*/
            if (currentUserId) {
                promises.push(Upvote.findOne({ parentId: data[i].id, user: currentUserId }).then(upvote => {
                    data[i].isUpvoted = !(upvote === null);
                }));
            }
        }

        await Promise.all(promises);

        res.status(200).json({ posts: data })
    }
    else {
        res.status(500).json({ message: "Error" });
    }
});

const createCodeComment = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const currentUserId = req.userId;
    const { codeId, message, parentId } = req.body;

    const code = await Code.findById(codeId);
    if (code === null) {
        res.status(404).json({ message: "Code not found" });
        return
    }

    let parentPost = null;
    if (parentId !== null) {
        parentPost = await Post.findById(parentId);
        if (parentPost === null) {
            res.status(404).json({ message: "Parent post not found" });
            return
        }
    }

    const reply = await Post.create({
        _type: 3,
        message,
        codeId,
        parentId,
        user: currentUserId
    })

    if (reply) {

        code.comments += 1;
        await code.save();

        if (parentPost) {
            parentPost.answers += 1;
            await parentPost.save();
        }

        res.json({
            post: {
                id: reply._id,
                message: reply.message,
                date: reply.createdAt,
                userId: reply.user,
                codeId: reply.codeId,
                parentId: reply.parentId,
                isAccepted: reply.isAccepted,
                votes: reply.votes,
                answers: reply.answers
            }
        })
    }
    else {
        res.status(500).json({ message: "error" });
    }
});

const editCodeComment = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const currentUserId = req.userId;
    const { commentId, message } = req.body;

    if (typeof message === "undefined") {
        res.status(400).json({ message: "Some fields are missing" })
        return
    }

    const comment = await Post.findById(commentId);

    if (comment === null) {
        res.status(404).json({ message: "Post not found" })
        return
    }

    if (currentUserId != comment.user) {
        res.status(401).json({ message: "Unauthorized" });
        return
    }

    comment.message = message;

    try {
        await comment.save();

        res.json({
            success: true,
            data: {
                id: comment._id,
                message: comment.message
            }
        })
    }
    catch (err: any) {
        res.json({
            success: false,
            error: err,
            data: null
        })
    }

});

const deleteCodeComment = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const currentUserId = req.userId;
    const { commentId } = req.body;

    const comment = await Post.findById(commentId);

    if (comment === null) {
        res.status(404).json({ message: "Post not found" })
        return
    }

    if (currentUserId != comment.user) {
        res.status(401).json({ message: "Unauthorized" });
        return
    }

    const code = await Code.findById(comment.codeId);
    if (code === null) {
        res.status(404).json({ message: "Code not found" })
        return
    }

    try {

        await Post.deleteAndCleanup({ _id: commentId });

        res.json({ success: true });
    }
    catch (err: any) {
        res.json({ success: false, error: err })
    }
})

const discussController = {
    createQuestion,
    getQuestionList,
    getQuestion,
    createReply,
    getReplies,
    getTags,
    toggleAcceptedAnswer,
    editQuestion,
    deleteQuestion,
    editReply,
    deleteReply,
    votePost,
    createCodeComment,
    getCodeComments,
    editCodeComment,
    deleteCodeComment
}

export default discussController;