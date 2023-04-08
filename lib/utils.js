const extName = require('ext-name')

const getCommentMediaInfo = (comment) => {
  if (!comment?.thumbnailUrl && !comment?.link) {
    return
  }

  const mime = extName(new URL(comment.link).pathname.replace('/', '')).mime

  if (mime?.startsWith('image')) {
    return {url: comment.link, type: 'image'}
  }
  if (comment.thumbnailUrl) {
    return {url: comment.thumbnailUrl, type: 'image'}
  }
  if (mime?.startsWith('video')) {
    return {url: comment.link, type: 'video'}
  }
}

module.exports = {getCommentMediaInfo}
