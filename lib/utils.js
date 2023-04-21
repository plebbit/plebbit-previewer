const extName = require('ext-name')

const getCommentMediaInfo = (comment) => {
  if (!comment?.thumbnailUrl && !comment?.link) {
    return
  }

  let mime
  if (comment.link) {
    const res = extName(new URL(comment.link).pathname.replace('/', ''))[0]
    mime = res.mime
  }

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
