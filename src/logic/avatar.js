// 头像地址统一解析：
// - 空值                      -> 默认头像 /avatars/default.webp
// - 已以 / 开头或 http(s) 绝对地址 -> 原样返回（自建后端返回的就是 /avatars/xxx.webp）
// - 其余（裸文件名）           -> 拼上 /avatars/ 前缀
// 背景：服务端 /upload/avatar 返回的 avatarUrl 是 "/avatars/xxx.webp"，
// 而历史代码里有的地方按裸文件名处理（又拼了一次 /avatars/），会导致出现
// "/avatars//avatars/xxx.webp" 这种 404 地址。集中在这里兼容两种写法。
export function avatarUrl(image, fallback = "default.webp") {
  let value = typeof image === "string" ? image.trim() : "";
  if (!value) value = fallback;
  if (/^(?:https?:)?\/\//i.test(value) || value.charAt(0) === "/") {
    return value;
  }
  return "/avatars/" + value;
}

export default avatarUrl;
