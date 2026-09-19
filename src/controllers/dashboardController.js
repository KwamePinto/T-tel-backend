import { Post, Page, Person, Media, Form, FormSubmission, Event, Document, User, ContentType } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const overview = asyncHandler(async (req, res) => {
  const [posts, pages, people, media, documents, events, submissions, users, types] = await Promise.all([
    Post.countDocuments({ deletedAt: null }),
    Page.countDocuments({ deletedAt: null }),
    Person.countDocuments({ deletedAt: null }),
    Media.countDocuments({ deletedAt: null }),
    Document.countDocuments({ deletedAt: null }),
    Event.countDocuments({ deletedAt: null }),
    FormSubmission.countDocuments({ deletedAt: null, isRead: false }),
    User.countDocuments(),
    ContentType.find({ isActive: true }).lean(),
  ]);

  const byType = await Promise.all(
    types.map(async (t) => ({
      id: t._id, name: t.name, slug: t.slug,
      count: await Post.countDocuments({ contentType: t._id, deletedAt: null }),
    })),
  );

  const recent = await Post.find({ deletedAt: null })
    .sort("-updatedAt").limit(8)
    .populate("author", "name").populate("contentType", "name")
    .select("title status updatedAt author contentType").lean();

  res.json({
    counts: { posts, pages, people, media, documents, events, unreadSubmissions: submissions, users },
    contentTypes: byType,
    recent,
  });
});
