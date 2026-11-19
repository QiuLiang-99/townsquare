# Release Notes

### Version 3.4.4  (2026.11.19)
- 剧本库卡片显示剧本封面缩略图（经服务端代理绕过图床防盗链）
- 剧本库卡片显示剧本所属分类

### Version 3.4.3  (2026.11.17)
- 剧本库新增「作者」筛选：可选择「博物馆」，查看 B 站「钟楼剧本博物馆」账号自动同步的剧本
- 剧本库「更多筛选」移除「必须包含的角色」「排除的角色」两项
- 新增「角色图标强制加载」：勾选后角色图标改用钟楼剧本博物馆 BWIKI 图床，图床缺失或加载失败时回退剧本原图，仅本地生效
- 角色死亡或换角色时自动移除该角色带来的标记（含挂在其他座位上的），底部提示条 5 秒内可撤回
- 传奇角色下方新增说书人标记按钮，可放置不属于任何玩家的标记（仅自己可见，点击即可移除）
- 同一说书人打开多个说书人网页时提示关闭其中一个，避免多个说书页互相广播打架

### Version 3.4.2  (2026.11.16)
- 新增「剧本库」：在「选择剧本」中在线浏览 7uuu 钟楼剧本库，支持按分类、人数、可用状态、剧本图完整度、角色包含/排除等条件筛选，一键导入为自定义剧本
- 剧本库支持收藏剧本、查看最近导入记录
- 世界大厅的房间封面改为显示当前剧本自带的封面图，并按长条图比例完整展示
- 修复剧本库卡片「剧本图」数量统计错误（改为按正面与背面计数）
- 「角色-参考资料」新增「下载剧本图」，可下载当前剧本的角色表（无角色表时下载封面）

### Version 3.4.1  (2026.11.15)
- 新增「夜间唤醒助手」：按夜间顺序逐个唤醒角色，勾选进度按夜次隔离，支持非官方角色，图标优先使用角色自带图片
- 新增「快捷唤醒短语」：说书人半夜叫醒玩家时可选择预设短语并填空后全屏展示
- 新增「复盘视角」：全场盖牌，说书人点座后全场可见该玩家身份
- 新增「盲抽角色」：说书人发起后玩家各抽一张，再统一分配至魔典
- 重排菜单按钮分类，按使用场景重新归组；重做隐藏按钮效果
- 新增统一「新开一局」复位函数，统一各功能开局时的状态清理
- 修复私聊看不到自己发送的消息、玩家看不到与说书人的延迟问题
- 修复夜间唤醒助手点击无响应的问题
- 修复世界大厅中自定义剧本名称显示为 custom 的问题
- 修复新加入房间的玩家看不到座位的问题（服务端补发缓存的 gamestate）
- 移除捐赠链接；更新日志下方新增构建版本信息，修复版本误报

### Version 3.4.0  (2026.11.14)
- 新增“世界大厅”：未加入房间时列出所有已开启的房间，展示房间名、房间号、说书人名称、已有人数/最大人数、剧本名称与剧本图片，点击卡片可直接加入
- 创建房间界面新增“房间名”输入框（可留空，留空则以房间号作为房间名）
- 服务端新增房间元数据（房间名/说书人/剧本/人数）记录与下发，房间任意字段变化实时更新大厅状态
- 修复说书人解散房间后大厅仍残留该房间的问题（解散即时移除）
- 增加 GHCR Docker 镜像发布及服务器定时拉取部署流程，支持健康检查失败后回滚
- 正式 Docker 镜像迁移至 `ghcr.io/blood-on-the-computer/townsquare`；仅正式仓库的 `main` 分支发布，PR 和 fork 只执行检查与镜像冒烟测试
- 角色配置“设置调整 / 认知覆盖”机制：角色配置界面按角色能力自动增减外来者/爪牙，并支持酒鬼、疯子等认知覆盖角色的伪装牌自动分配
- 修复由于复盘模式新开一局后原本死亡的玩家仍然处于死亡状态无法投票的bug

### Version 3.3.1 ( 2026.06.28)
- 夜间顺序表可以选择是否显示空座位提示
- 加入线下角色盲抽功能
- 修改版本检测逻辑
- 修改头像上传逻辑

### Version 3.3.0  (2026.04.06)
- 优化连接方式，减少连接请求
- 加入新奇遇角色
- 加入说书人密钥增强房间安全
- 不允许以0开头的房间创建

### Version 3.2.3 （2025.12.29）
- 允许自定义奇遇角色
- 旅行者traveller和traveler可以同时检测
- 连接bug修复
- 传奇角色（说书人bug修复）

### Version 3.2.2 （2025.12.22）
- 更新新奇遇角色印度教教徒
- 允许旧版炼金术士和半兽人
- 加入诡异童话
- 更新参考说明

### Version 3.2.1 （2025.12.15）
- 加入新奇遇角色
- 允许json中自定义原创角色jinx和夜间顺序，允许自定义私货商人bootlegger
- 加入亡魂

### Version 3.2.0 （2025.11.24）
- 加入群聊功能，说书人可以创建群聊以帮助玩家沟通
- 优化复盘模式，现在可以看到说书人的非自定义token
- 增加更新日志

### Version 3.1.2 （2025.06.25）
- 加入局后复盘功能
- 加入玩家可以投多票的功能（报丧女妖）

---

### Version 3.1.1 （2025.06.06 首发）
- 加入全角色合集，以及全角色合集范围选项
- 允许在魔典内直接自定义私货商人
- 允许仅发送角色类型

---

### Version 3.1.0
- 加入功能发送魔典、单独发送伪装身份
- 加入选择角色版本功能
- 加入闭眼投票功能（街头风琴手）

---

### Version 3.0.1
- 加入华灯初上和山雨欲来角色
- 加入语音检测蓝圈
- 加入头像功能

---

### Version 3.0.0
- 汉化魔典
- 加入魔典内文字私聊功能
- 增加手机端格式
- 这个项目取自开源项目[bra1n/townsquare](https://github.com/bra1n/townsquare)，由[limpy01](https://github.com/limpy01)全程汉化和优化，官方发布地址为：https://botcgrimoire.top/

---

### Version 2.16.2
- fixed custom script format to support new script tool JSON
- updated packages to be compatible with Node >= 18 again

---

### Version 2.16.1
- Updated character night order to be consistent with script tool

---

### Version 2.16.0
- Add ability to use json from clipboard to upload script (by @alexanderfletcher)

---

### Version 2.15.4
- fixed flickering of add reminder token
- added redirect to Chinese version

---

### Version 2.15.3
- add Huntsman/Damsel, Noble, Al-Hadikhia, Golem, Fearmonger, Puzzlemaster, Alchemist, Engineer, Riot, Psychopath, Atheist, Nightwatchman to list of available characters
- fixed game state JSON not handling custom Fabled correctly

---

### Version 2.15.2
- added mobile web application support
- show correct number of leaves on roles with global reminders
- fixed a bug with traveler list showing up when assigning demon bluffs
- fixed a bug with homebrew scripts that contained negative night order positions

---

### Version 2.15.1
- fix Mephit not showing up on scripts, futureproof Mephit name change
- add Boomdandy to list of available characters

---

### Version 2.15.0
- clean up transparent portions of icons
- add Magician & LLeech to list of available characters

---

### Version 2.14.0
- added Farmer to list of available characters

---

### Version 2.13.0
- fix players being moved or removed during nomination
- add vue linter
- use "Exile" rather than "Banishment" for exiles
- added global animation toggle for better performance
- added record vote history toggle to session menu, and clear vote history button
- add support for custom Fabled characters
- show Jinxed interactions on character reference list
- add 'marked for execution' indicator

---

### Version 2.12.0
- tweak reference sheet to better fit screen in single column layout
- add warning icon overlay for setup roles on character assignment modal
- added Heretic and Marionette plus King/Choirboy and the Gangster to list of available characters

---

### Version 2.11.0
- new design for character reference sheet
- automatically switch to grimoire view when joining a session through a link
- fixed demon bluffs showing on public town square
- fixed a bug that prevented connecting to a session when previously being connected and joining through a link

---

### Version 2.10.0
- added [nomination log indicator](https://fontawesome.com/icons/book-dead).  When a nomination log [v] is available, the number of currently visible entries is displayed. Clicking the indicator can reveal/hide the nomination log.
- fix issue where a player and storyteller updating the same players pronouns at around the same time causes an infinite loop disconnecting the session.
- fix bug with shifting roles when the storyteller deletes a player
- added Poppygrower to list of available characters

---

### Version 2.9.1
- fix gamestate JSON not showing (custom) roles and failing to load states with custom scripts properly
- fix gamestate not stripping out special characters from role.id on load
- made character assignment modal a bit prettier
- got rid of the extra pixels on the  Soldier icon
- fixed lengthy live session channel names not being correctly cut off
- hide player names in night order / character reference popup when town square is public
- fix (pre-)vote calculation being off by one if the nominee votes

---

### Version 2.9.0
- added support for assigning pronouns to players and display of the pronouns in a tooltip on the player name.
- added button to modals that allows the user to maximize them
- added Mephit and Snitch to roles.json

---

### Version 2.8.0
- added hands-off live session support for homebrew / custom characters again!
- added custom image opt-in that will prevent any (potentially malicious / harmful) images from loading until a player manually allows them to

---

## Version 2.7.0
- added support for assigning duplicate characters to more than one player (like Legion)
- further live session bandwidth optimizations
- sessions can now be joined by pasting the whole link into the popup (thanks @davotronic5000)
- fabled night order bug fixed
- added Legion to list of available characters (thanks @eddgabriel)
- added support for mp4/webm video backgrounds
- added tooltips to night order popup

---

## Version 2.6.0
- night mode can be toggeled with [S] now (thanks @davotronic5000)
- night order shows which players are dead

---

## Version 2.5.0
- all travelers from the base editions are now optionally available (thanks @davotronic5000)
- night order shows player names near roles now

---

## Version 2.4.0
- added spoiler role (Pixie!)
- fixed bug with ST sending out roles that are not part of the current edition / script (ie. travelers or base set roles)
- better Lycanthrope icon (thanks @AWConant)

---

## Version 2.3.1
- better vote history design and added timestamps
- adjusted player menu styling on smaller screens
- improved CONTRIBUTING.md description of hosting your own copy

---

## Version 2.3.0
- added spoiler role (Lycanthrope!)
- fixed copy to clipboard in Firefox
- fixed non-countdown votes still playing countdown sound for a split second

---

## Version 2.2.1
- clearing players / roles now also clears Fabled
- fix list of locked votes showing unlocked votes sometimes

---

## Version 2.2.0
- added [V] hotkey to open nomination history (thanks @lilserf)
- updated roles according to official Wiki changes
- adjusted roles night order

---

## Version 2.1.1
- show vote results at the end of a vote
- fixed global reminders not showing up anymore when the associated role is assigned to a player
- adjusted backend metrics


---

## Version 2.1.0
- reduced countdown volume by 10db
- added a mute toggle to the Grimoire menu (currently only silences the countdown)
- pressing [J] while in a session will now leave the session
- always show reminder add button when on a mobile device that doesn't support hovering
- removed screenshot feature as it is no longer useful

---

## Version 2.0.4
- fix bug with live sessions that contain travelers from a different set
- fix server channel cleanup

---

## Version 2.0.3
- load roles that belong to different editions (like travelers) from gamestate
- close session when missing custom roles and open edition modal
- added a few more metrics

---

## Version 2.0.2
- fix nomination history type not detecting travelers
- fix live session domain whitelist
- fix build path
- fix changelog version numbering

---

## Version 2.0.1
- clearing the nomination history as the Storyteller clears it for the players too
- vote buttons should work in all situations correctly now
- fixed some minor styling and live session issues

---

## Version 2.0.0
- The project is now available under its own domain: [clocktower.online](https://clocktower.online)
- Added a feature that allows a live session Storyteller to automatically (and safely) distribute assigned
  characters to all players that have claimed a seat, eliminating the need to manually tell every player their role
- Visible "night phase" that can be toggled by the Storyteller
- Voting history added with nomination and vote results
- Optional, audible voting countdown added (featuring an actual clock tower bell!)
- Fabled show up on the Night Order sheet and affect Grimoire night order counters
- Current game state can now be easily exported and imported in the form of a JSON text code
- Voting can be paused and sped up / slowed down in 0.5 second increments by the Storyteller
- Voting terminology changed to "Hand UP" / "Hand DOWN" and iconography updated
- Added meta-data support for custom scripts, that currently supports `name`, `author` and a custom `logo` through a
  `_meta` role (note that a customized logo will not be synced to players in a live session)
- Players can no longer claim seats that are already occupied and only the Storyteller can vacate seats of other players
  (players can still vacate their own seat)
- Characters selected in the bluff window now also show up in the list of reminder tokens
- Homebrew scripts / custom characters no longer automatically load in live sessions, for 2 reasons:
  - the players in a live session have no control over the script that the storyteller loads,
    so a malicious storyteller could load a custom script that contains harmful / inappropriate images
  - some homebrew scripts are quite big JSON files and synching these through the live session
    server can cause traffic / performance issue easily
  - this change may be reverted in the future when I figure out a way to sync custom characters safely and without
    such a big impact on performance constraints
- Buggy (spamming) live session connections will now be terminated on the server side and display an error message
- Balloonist reminder tokens adjusted
- Live session URLs shortened
- Deus Ex Fiasco and Stormcatcher Fabled added / updated
- Custom Reminder text looks better when there is a lot of text
- added a README for the backend server

