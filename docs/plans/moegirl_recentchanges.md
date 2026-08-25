为了减少输出数量，limit设为5，仅用于演示请求和响应结构，实际实施中应当使用max。

## recentchanges

请求体
```json
{
	"action": "query",
	"format": "json",
	"list": "recentchanges",
	"utf8": 1,
	"formatversion": "2",
	"rcnamespace": "0",
	"rcprop": "title|timestamp",
	"rclimit": "5",
	"rctype": "new"
}
```

响应
```json
{
  "batchcomplete": true,
  "continue": {
    "rccontinue": "20260824173843|9799859",
    "continue": "-||"
  },
  "query": {
    "recentchanges": [
      {
        "type": "new",
        "ns": 0,
        "title": "达芬奇",
        "timestamp": "2026-08-25T00:50:38Z"
      },
      {
        "type": "new",
        "ns": 0,
        "title": "Age",
        "timestamp": "2026-08-24T19:23:40Z"
      },
      {
        "type": "new",
        "ns": 0,
        "title": "崩坏世界的魔杖匠人",
        "timestamp": "2026-08-24T17:40:37Z"
      },
      {
        "type": "new",
        "ns": 0,
        "title": "卫民推杆",
        "timestamp": "2026-08-24T17:39:21Z"
      },
      {
        "type": "new",
        "ns": 0,
        "title": "朱氏推杆",
        "timestamp": "2026-08-24T17:39:07Z"
      }
    ]
  }
}
```

## logevents (create)

请求体
```json
{
	"action": "query",
	"format": "json",
	"list": "logevents",
	"utf8": 1,
	"formatversion": "2",
	"leprop": "title|type|timestamp",
	"letype": "create",
	"lenamespace": "0",
	"lelimit": "5"
}
```

响应
```json
{
  "batchcomplete": true,
  "continue": {
    "lecontinue": "20260824173843|2550915",
    "continue": "-||"
  },
  "query": {
    "logevents": [
      {
        "ns": 0,
        "title": "达芬奇",
        "type": "create",
        "action": "create",
        "timestamp": "2026-08-25T00:50:38Z"
      },
      {
        "ns": 0,
        "title": "Age",
        "type": "create",
        "action": "create",
        "timestamp": "2026-08-24T19:23:40Z"
      },
      {
        "ns": 0,
        "title": "崩坏世界的魔杖匠人",
        "type": "create",
        "action": "create",
        "timestamp": "2026-08-24T17:40:37Z"
      },
      {
        "ns": 0,
        "title": "卫民推杆",
        "type": "create",
        "action": "create",
        "timestamp": "2026-08-24T17:39:21Z"
      },
      {
        "ns": 0,
        "title": "朱氏推杆",
        "type": "create",
        "action": "create",
        "timestamp": "2026-08-24T17:39:07Z"
      }
    ]
  }
}
```

## logevents (move)

请求体
```json
{
	"action": "query",
	"format": "json",
	"list": "logevents",
	"utf8": 1,
	"formatversion": "2",
	"leprop": "title|timestamp|details",
	"letype": "move",
	"lenamespace": "0",
	"lelimit": "5"
}
```

响应
```json
{
  "batchcomplete": true,
  "continue": {
    "lecontinue": "20260824154908|2550879",
    "continue": "-||"
  },
  "query": {
    "logevents": [
      {
        "ns": 0,
        "title": "夏負之壳",
        "params": {
          "target_ns": 0,
          "target_title": "夏负之壳",
          "suppressredirect": true
        },
        "timestamp": "2026-08-25T00:47:21Z"
      },
      {
        "ns": 0,
        "title": "加油吧!蜘蛛子的主题歌",
        "params": {
          "target_ns": 0,
          "target_title": "加油吧！蜘蛛子的主题歌",
          "suppressredirect": false
        },
        "timestamp": "2026-08-24T18:15:42Z"
      },
      {
        "ns": 0,
        "title": "达·芬奇",
        "params": {
          "target_ns": 0,
          "target_title": "达·芬奇(原型)",
          "suppressredirect": true
        },
        "timestamp": "2026-08-24T17:02:33Z"
      },
      {
        "ns": 0,
        "title": "陨星",
        "params": {
          "target_ns": 0,
          "target_title": "陨星(洛天依)",
          "suppressredirect": true
        },
        "timestamp": "2026-08-24T16:22:28Z"
      },
      {
        "ns": 0,
        "title": "加百利(瓢虫雷迪)",
        "params": {
          "target_ns": 0,
          "target_title": "加百利·阿格莱斯特",
          "suppressredirect": true
        },
        "timestamp": "2026-08-24T15:49:15Z"
      }
    ]
  }
}
```
