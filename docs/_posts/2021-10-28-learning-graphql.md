---
layout: post
title:  "Booklog : Learning GraphQL"
date:   2021-10-28 00:00:00 +0900
categories: blog
tags:
  - API
  - graphql
  - book
  - booklog
---


[O'Reilly Japan - 初めてのGraphQL](https://www.oreilly.co.jp/books/9784873118932/)の3 ~ 5章までのメモです。

実装したGraphqlサーバは[こちら](https://github.com/naotospace/naotospace.github.io/tree/main/sample/2021-10-28-learning-graphql/chapter-05)にあります。

なお、[MoonHighway/learning-graphql: The code samples for Learning GraphQL by Eve Porcello and Alex Banks, published by O'Reilly Media](https://github.com/MoonHighway/learning-graphql)にもサンプルコードがあるがnpmのライブラリのバージョンが古くてうまく動かなかったので参考になるかもしれません。

# 3章

## GETクエリサンプル
```bash
curl 'http://snowtooth.herokuapp.com' \
-H 'Content-Type: application/json' \
--data '{"query": "{ allLifts { name}}"}'

{"data":
  {"allLifts":
    [
      {"name":"Astra Express"},
      {"name":"Jazz Cat"},
      {"name":"Jolly Roger"},
      {"name":"Neptune Rope"},
      {"name":"Panorama"},
      {"name":"Prickly Peak"},
      {"name":"Snowtooth Express"},
      {"name":"Summit"},
      {"name":"Wally's"},
      {"name":"Western States"},
      {"name":"Whirlybird"}
    ]
  }
}
```

## 変更（mutation）クエリサンプル

```bash
curl 'http://snowtooth.herokuapp.com' \
-H 'Content-Type: application/json' \
--data '{"query": "mutation {setLiftStatus(id: \"panorama\" status: OPEN) {name status}}"}'

{"data":{"setLiftStatus":{"name":"Panorama","status":"OPEN"}}}
```


## 試してみよう

### GraphiQL

https://graphql.org/swapi-graphql

```
# query sample
{
  person(personID: 1) {
    name
    birthYear
    created
    filmConnection {
      films {
        title
        director
        releaseDate
      }
    }
  }
}

```

### GraphQL Playground
https://snowtooth.moonhighway.com/

```graphql
# シンプルなquery
query {
  allLifts {
    	name
    	status
  }
}

# 複数のリソースをまとめて取得するquery
query liftsAndTrails {
  liftCount(status: OPEN)
  allLifts {
    name
    status
  }
  allTrails {
    name
    difficulty
  }
}

```

## スカラー型とオブジェクト型の話

## fragmentを使ったクエリ

fragment ... 選択セットのフィールドを定義しておくと使わ回すことができるためメンテナビリティが高まる

```graphql
fragment liftInfo on Lift {
  name
  status
  capacity
  night
  elevationGain
}

query {
  Lift(id: "jazz-cat") {
    ...liftInfo
    trailAccess {
      name
      difficulty
    }
  }
  Trail(id: "river-run") {
    name
    difficulty
    accessedByLifts {
      ...liftInfo
    }
  }
}
```

## ユニオン型

複数の型のオブジェクトを含むリストがほしい

下記のagendaクエリのレスポンスには2つのオブジェクトが配列として返却される

```graphql
# Inline fragmentを使い複数の方に対してそれぞれにフィールドを指定する

query schedule {
  agenda {
    ...on Workout {
      name
      repos
    }
    ...on StudyGroup {
      name
      subject
      students
    }
  }
}

# 名前付きfragmenを使うこともできる
query today {
  agenda {
    ...workout
    ...study
  }
}

fragment workout on Workout {
  name
  repos
}

fragment study on StudyGroup {
  name
  subject
  students
}
```

## インターフェース

複数のオブジェクト型を使うための手法
下の例だと `findEventsAtVenue` の内の各オブジェクトで選択するフィールドを定義している（id, name, minAgeRestrinction, startsAt)

on *** でフラグメントを定義して、特定のオブジェクトでのみ追加するフィールドを定義することができる

```
query {
  findEventsAtVenue(venueId: "Madison Square Garden") {
    id
    name
    minAgeRestriction
    startsAt

    ... on Festival {
      performers
    }

    ... on Concert {
      performingBand
    }

    ... on Conference {
      speakers
      workshops
    }
  }
}
```

```
{
  "data": {
    "findEventsAtVenue": [
      {
        "id": "Festival-2",
        "name": "Festival 2",
        "minAgeRestriction": 21,
        "startsAt": "2018-10-05T14:48:00.000Z",
        "performers": [
          "The Singers",
          "The Screamers"
        ]
      },
      {
        "id": "Concert-3",
        "name": "Concert 3",
        "minAgeRestriction": 18,
        "startsAt": "2018-10-07T14:48:00.000Z",
        "performingBand": "The Jumpers"
      },
      {
        "id": "Conference-4",
        "name": "Conference 4",
        "minAgeRestriction": null,
        "startsAt": "2018-10-09T14:48:00.000Z",
        "speakers": [
          "The Storytellers"
        ],
        "workshops": [
          "Writing",
          "Reading"
        ]
      }
    ]
  }
}
```

## ミューテーション
ミューテーションは書き込み操作を行う


- 危険なミューテーション
  ```
  # dangelous mutation
  mutation burnItDown {
    deleteAllData
  }
  ```
- Createサンプル
  ```
  mutation createSong {
    addSong(title: "No Scrubs", numberOne: true, performerName: "TLC") {
      id
      title
      numberOne
    }
  }
  ```

  ```
  # Response
  {
    "data": {
      "addSong": {
        "id": "hogehogehgoe",
        "title": "No Scrubs",
        "nuberOne": true
      }
    }
  }
  ```
- Updateサンプル
  ```
  mutation closeLift {
    setLiftStatus(id: "jass-cat" status: CLOSED) {
      name
      status
    }
  }
  ```

### クエリ変数

動的に値を変えて実行できるようになる

```
mutation createSong ($title:String! $numberOne:Int $by:String!) {
  addSong(title:$title, numberOne:$numberOne, performerName:$by) {
    id
    title
    numberOne
  }
}
```

## サブスクリプション

GraphQLサーバからリアルタイムにデータの更新情報を受け取ることができる

いいね情報をリアルタイムに更新したいという要求から生まれた

下記のsubscriptionを設定するとリフトの状態が変化したことの通知をWebSocketを通じて受け取ることができる

https://snowtooth.moonhighway.com/ で試せます。

```
subscription {
  liftStatusChange {
    name
    capacity
    status
  }
}
```

subscriptionを実行した後下記のMutationを実行する
```
mutation closeLift {
  setLiftStatus(id: "astra-express" status: HOLD) {
    name
    status
  }
}
```

subscriptionは停止するまで監視し続ける

## イントロスペクション
APIスキーマの詳細を取得できる機能

- APIで属できるすべての方の情報が取得できる
  ```
  query {
    __schema {
      types {
        name
        description
      }
    }
  }
  ```

  ```json
  {
    "data": {
      "__schema": {
        "types": [
          {
            "name": "Lift",
            "description": "A `Lift` is a chairlift, gondola, tram, funicular, pulley, rope tow, or other means of ascending a mountain."
          },
          {
            "name": "ID",
            "description": "The `ID` scalar type represents a unique identifier, often used to refetch an object or as key for a cache. The ID type appears in a JSON response as a String; however, it is not intended to be human-readable. When expected as an input type, any string (such as `\"4\"`) or integer (such as `4`) input value will be accepted as an ID."
          },
          {
            "name": "String",
            "description": "The `String` scalar type represents textual data, represented as UTF-8 character sequences. The String type is most often used by GraphQL to represent free-form human-readable text."
          },
          {
            "name": "Int",
            "description": "The `Int` scalar type represents non-fractional signed whole numeric values. Int can represent values between -(2^31) and 2^31 - 1."
          },
          {
            "name": "Boolean",
            "description": "The `Boolean` scalar type represents `true` or `false`."
          },
          {
            "name": "Trail",
            "description": "A `Trail` is a run at a ski resort"
          },
          {
            "name": "LiftStatus",
            "description": "An enum describing the options for `LiftStatus`: `OPEN`, `CLOSED`, `HOLD`"
          },
          {
            "name": "TrailStatus",
            "description": "An enum describing the options for `TrailStatus`: `OPEN`, `CLOSED`"
          },
          {
            "name": "SearchResult",
            "description": "This union type returns one of two types: a `Lift` or a `Trail`. When we search for a letter, we'll return a list of either `Lift` or `Trail` objects."
          },
          {
            "name": "Query",
            "description": null
          },
          {
            "name": "Mutation",
            "description": null
          },
          {
            "name": "Subscription",
            "description": null
          },
          {
            "name": "CacheControlScope",
            "description": null
          },
          {
            "name": "Upload",
            "description": "The `Upload` scalar type represents a file upload."
          },
          {
            "name": "__Schema",
            "description": "A GraphQL Schema defines the capabilities of a GraphQL server. It exposes all available types and directives on the server, as well as the entry points for query, mutation, and subscription operations."
          },
          {
            "name": "__Type",
            "description": "The fundamental unit of any GraphQL Schema is the type. There are many kinds of types in GraphQL as represented by the `__TypeKind` enum.\n\nDepending on the kind of a type, certain fields describe information about that type. Scalar types provide no information beyond a name, description and optional `specifiedByUrl`, while Enum types provide their values. Object and Interface types provide the fields they describe. Abstract types, Union and Interface, provide the Object types possible at runtime. List and NonNull types compose other types."
          },
          {
            "name": "__TypeKind",
            "description": "An enum describing what kind of type a given `__Type` is."
          },
          {
            "name": "__Field",
            "description": "Object and Interface types are described by a list of Fields, each of which has a name, potentially a list of arguments, and a return type."
          },
          {
            "name": "__InputValue",
            "description": "Arguments provided to Fields or Directives and the input fields of an InputObject are represented as Input Values which describe their type and optionally a default value."
          },
          {
            "name": "__EnumValue",
            "description": "One possible value for a given Enum. Enum values are unique values, not a placeholder for a string or numeric value. However an Enum value is returned in a JSON response as a string."
          },
          {
            "name": "__Directive",
            "description": "A Directive provides a way to describe alternate runtime execution and type validation behavior in a GraphQL document.\n\nIn some cases, you need to provide options to alter GraphQL's execution behavior in ways field arguments will not suffice, such as conditionally including or skipping a field. Directives provide this by describing additional information to the executor."
          },
          {
            "name": "__DirectiveLocation",
            "description": "A Directive can be adjacent to many parts of the GraphQL language, a __DirectiveLocation describes one such possible adjacencies."
          }
        ]
      }
    }
  }
  ```
- 特定の型の詳細が知りたいとき
  ```
  query liftDetails {
    __type(name: "Lift") {
      name
      fields {
        name
        description
        type {
          name
        }
      }
    }
  }
  ```
  ```json
  {
    "data": {
      "__type": {
        "name": "Lift",
        "fields": [
          {
            "name": "id",
            "description": "The unique identifier for a `Lift` (id: \"panorama\")",
            "type": {
              "name": null
            }
          },
          {
            "name": "name",
            "description": "The name of a `Lift`",
            "type": {
              "name": null
            }
          },
          {
            "name": "status",
            "description": "The current status for a `Lift`: `OPEN`, `CLOSED`, `HOLD`",
            "type": {
              "name": "LiftStatus"
            }
          },
          {
            "name": "capacity",
            "description": "The number of people that a `Lift` can hold",
            "type": {
              "name": null
            }
          },
          {
            "name": "night",
            "description": "A boolean describing whether a `Lift` is open for night skiing",
            "type": {
              "name": null
            }
          },
          {
            "name": "elevationGain",
            "description": "The number of feet in elevation that a `Lift` ascends",
            "type": {
              "name": null
            }
          },
          {
            "name": "trailAccess",
            "description": "A list of trails that this `Lift` serves",
            "type": {
              "name": null
            }
          }
        ]
      }
    }
  }
  ```
- 新しいAPIを使う場合はルート型で指定できるフィールド確認スべし
  ```
  query roots {
    __schema {
      queryType {
      	...typeFields
      }
      mutationType {
        ...typeFields
      }
      subscriptionType {
        ...typeFields
      }
    }
  }

  fragment typeFields on __Type {
    name
    fields {
      name
    }
  }
  ```
  ```json
  {
    "data": {
      "__schema": {
        "queryType": {
          "name": "Query",
          "fields": [
            {
              "name": "allLifts"
            },
            {
              "name": "allTrails"
            },
            {
              "name": "Lift"
            },
            {
              "name": "Trail"
            },
            {
              "name": "liftCount"
            },
            {
              "name": "trailCount"
            },
            {
              "name": "search"
            }
          ]
        },
        "mutationType": {
          "name": "Mutation",
          "fields": [
            {
              "name": "setLiftStatus"
            },
            {
              "name": "setTrailStatus"
            }
          ]
        },
        "subscriptionType": {
          "name": "Subscription",
          "fields": [
            {
              "name": "liftStatusChange"
            },
            {
              "name": "trailStatusChange"
            }
          ]
        }
      }
    }
  }
  ```

## 抽象構文木
参考： https://atmarkit.itmedia.co.jp/ait/articles/0707/11/news129.html

# 4章 スキーマの設計
RESTのようにエンドポイントの集合ではなく、型の集合として捉える = スキーマ


GraphQL SDL（ Schema Definition Language ）がある

[memo] これはAPIテストに使えそう

型やフィールドは開発チーム内で共通認識を作っていく

## 型定義

スキーマの核は型

写真共有アプリケーションで考えていく
- GitHubアカウントでログイン
- 写真投稿
- ユーザがタグを付加できる

サンプルアプリケーションのスキーマ定義
- 記述について
  - `フィールド名: 型名`
  - `!`はNot NULL値
  - 組み込みの方はスカラー型と呼ぶ
    - String: JSONの文字列として返却
    - ID: ユニークな値になるかをバリデーションする、JSON文字列を返却
    - Int
    - Float
    - Boolian

User型定義
```
type Photo {
  id: ID!
  name: String!
  url: String!
  description: String!
}
```

### スカラー型

カスタムスカラー型を定義できる
- DateTime: JSON文字列を返却。日時データとしてシリアライズできる正しいフォーマットかバリデーションされる
```
scalar DateTie

type Photo {
  id: ID!
  name: String!
  url: String!
  description: String!
  created: DateTime!
}
```

### Enum ( 列挙型 )

予め定められた特定の文字列の一つを返すスカラー型

限られた選択肢のうち一つを返すようなフィールドを実装したいときに使う

例）
```
enum PhotCategory {
  SELFIE
  PORTRAIT
  ACTION
  LANDSCAPE
  GRAPHIC
}

type Photo {
  id: ID!
  name: String!
  url: String!
  description: String!
  created: DateTime!
  category: PhotoCategory!
}
```

## コネクションとリスト

特定の型のリストを定義できる

!の使い方が色々ある
```
[Int]   : [1,2,3] or [null, 2, 3] or 配列自体がnull or []
[Int!]  : [1,2,3] or 配列自体がnull or []
[Int]!  : [1,2,3] or [null, 2, 3] or []
[Int!]! : [1,2,3] or []
```

基本的にはnull許可しない使い方をする

### 一対一の接続

PhotoはUserによって投稿されます。

つまりPhotoはUserとの間にエッジを持っているはずです。

`Photo --postedBy--> User`

スキーマ定義
```
type User {
  githubLogin: ID!
  name: String
  avatar: String
}

type Photo {
  id: ID!
  name: String!
  url: String!
  description: String
  created: DateTime!
  category: PhotoCategory!
  postBy: User!
}
```

### 一対多の接続

GraphQLのサービスは無向グラフにしておくといい

クライアントが自由度の高いクエリが作れるため

任意のノードを起点として接続していけるため

User型とPhoto型に双方向にエッジを作ると実現できる

Userは複数のPhotoを持つのでリストで定義する

スキーマ定義
```
type User {
  githubLogin: ID!
  name: String
  avatar: String
  postedPhotos: [Photo!]!
}

```

```
User --postedBy--> Photo
     --postedBy--> Photo
     --postedBy--> Photo
```

一対多の接続はルート型でよく使う

PhotoやUserをクエリで使えるようにするため

Query型のフィールドに追加すると使用できるようになる

```
type Query {
  totalPhots: Int!
  allPhots: [Photo!]!
  totalUsers: Int!
  allUsers: [User!]!
}

schema {
  query: Query
}
```

PhotoとUserを問い合わせるクエリ例
```
query {
  totalPhotos
  allPhotos {
    name
    url
  }
}
```

### 多対多の接続

写真に写っているユーザを写真にタグ付けする機能

```
type User {
  githubLogin: ID!
  name: String
  avatar: String
  postedPhotos: [Photo!]!
  inPhotos: [Photo!]!
}

type Photo {
  id: ID!
  name: String!
  url: String!
  description: String
  created: DateTime!
  category: PhotoCategory!
  postBy: User!
  taggedUsers: [User!]!
}

```

#### スルー型
多対多の関係の関係自体に意味合いを持たせたいときに使う

User同士の友人関係で考えてみる

Userがfriendsのリストを持っている
```
type User {
  friends: [User!]!
}
```
知り合ってからの期間という関係性をもたせるにはどうするか

-> カスタムオブジェクト型で新しいエッジを構築する

UserとUserをつなぐためスルー型と言われる

```
type User {
  friends: [FriendShip!]!
}

type FriendShip {
  friend_a: User!
  friend_b: User!
  howLong: Int!
  whereWeMet: Location
}
```

同じ機会に複数の友人関係が構築される場合を考慮する
```
type FriendShip {
  friends: [User!]!
  howLong: Int!
  whereWeMet: Location
}
```

### 異なる型のリスト

予定表を例にして考える

予定表の特徴
- 予定表は様々なイベントで構成されている
- それぞれのデータは異なるフィールドを持っている
  - 例. 勉強会とワークアウト
- 異なる型の用事リストと考えられる

`ユニオン型` と `インターフェース` がある

含まれている複数の方が全く異なるのであれば、`ユニオン型`

共通のフィールドがある場合は `インターフェース` を使う

#### ユニオン型

ユニオン型は複数の型のうちの一つを返す型

```
query schedule {
  agenda {
    ...on Workout {
      name
      reps
    }
    ...on StudyGroup {
      name
      subject
      students
    }
  }
}
```

AgendaItemというユニオン型で定義した場合

```
# 好きなだけ多くの型を追加できる
# パイプでつなぐだけ
union AgendaItem = StudyGroup | Workout

type StudyGroup {
  name: String!
  subject: String!
  students: [User!]!
}

type Workout {
  name: String!
  reps: Int!
}

type Query {
  agenda: [AgendaItem!]!
}

```

#### インターフェース

インターフェースはオブジェクト型に実装できる抽象型

```
query schedule {
  agenda {
    name
    start
    end
    ...on Workout {
      reps
    }
  }
}
```

```
scalar DateTime

interface AgendaItem {
  name: String!
  start: DateTime!
  end: DateTime!
}

type StudyGroup implements AgendaItem {
  name: String!
  start: DateTime!
  end: DateTime!
  participants: [User!]!
  topic: String!
}

type Workout implements AgendaItem {
  name: String!
  start: DateTime!
  end: DateTime!
  reps: Int!
}

type Query {
  agenda: [AgendaItem!]!
}
```

## 引数

```
type Query {
  .....
  User(githubLogin: ID!): User!
  Photo(id: ID!): Photo!
}
```

```
query {
  User(githubLogin: "MoonTahoe") {
    name
    avatar
  }
}

query {
  Photo(id: "hogahogfugafuga") {
    name
    description
    url
  }
}
```


### データのフィルタリング

カテゴリを受け取って絞り込んだ結果を返却させるクエリ

```
type Query {
  allPhotos(category: PhotoCategory): [Photo!]!
}
```

```
query {
  allPhotos(category: "SELFIE") {
    name
    description
    url
  }
}
```

#### データページング

データ量を指定して取得する処理


```
type Query {
  allUsers(first: Int=50 start: Int=0): [User!]!
  allPhotos(first: Int=25 start: Int=0): [Photo!]!
}
```

```
query {
  allUsers(first: 10 start: 90) {
    name
    avatar
  }
}
```

#### ソート


```
# ソートのキーや順序ルールはenumで定義
enum SortDirection {
  ASCENDING
  DESCENDING
}

enum SortablePhotoField {
  name
  description
  category
  created
}

# sort, sortByを引数に追加
Query {
  allPhotos(
    sort: SortDirection = DESCENDING
    sortBy: SortablePhotoField = created
  ): [Photo!]!
}

# 呼び出し
query {
  allPhotos(sortBy: name) {
    name
    url
  }
}
```

Query型以外のすべて型のフィールドに対して引数を設定することもできる

```
type User {
  postedPhotos(
    first: Int: 25
    start: Int = 0
    sort: SortDirection = DESCENDING
    sortBy: SortablePhotoField = created
    category: PhotoCategory
  ): [Photo!]
}
```


## ミューテーション

アプリケーションでの動作（動詞）と対応付けるのが望ましい

ユーザが行う操作をすべて列挙する

写真アプリケーション
- GitHubアカウントでサインインする
- 写真を投稿する
- 写真にタグ付けする

ルート型のMutationに追加するとクライアントから利用できるようになる

```
# スキーマ定義
type Mutation {
  postPhoto(
    name: String!
    description: String
    category: PhotoCategory=PORTRAIT
  ): Photo!
}

schema {
  query: Query
  mutation: Mutation
}

# Mutation実行
mutation {
  postPhoto(name: "Sending the Palisades") {
    id
    url
    created
    postedBy {
      name
    }
  }
}
```

## 入力型
引数の数が増えてしまった場合に入力型を使う

```
input PostPhotoInput {
  name: String!
  description: String
  category: PhotoCategory=PORTRAIT
}

type Mutation {
  postPhoto(input: PostPhotoInput!): Photo!
}
```


## 返却型

## サブスクリプション

```
type Subscription {
  newPhoto: Photo!
  newUser: User!
}

schema {
  query: Query
  mutation: Mutation
  subscription: Subscription
}
```

```
# フィルターができる定義
type Subscription {
  newPhoto(category: PhotoCategory): Photo!
  newUser: User!
}

# ACTIONカテゴリだけ通知
subscription {
  newPhoto(category: "ACTION") {
    id
    name
    url
    postBy {
      name
    }
  }
}
```

## スキーマのドキュメント化
`"`を使ってコメントを付加でき、イントロスペクションクエリで取得できる

```
type Mutation {
  """
  GitHubユーザで認可
  """
  githubAuth(
    "ユーザの認可のために送信されるGitHubのユニークなコード"
    code: String!
  ): AuthPayload!
}
```

# 5章 GraphQLサーバーの実装

環境
- JavaScript
- Apollo Server

## プロジェクトセットアップ

配布されているコードが動作しない（おそらくバージョンが古い）ため、Apolloの公式ドキュメントの手順で構築を進める

```bash
npm init --yes
npm install apollo-server graphql nodemon
```

### nodemonの設定

ファイルの更新を監視し、サーバーを再起動するための設定
```json
  "scripts": {
    "start": "nodemon -e js,json,graphql"
  },
```

### バージョン1 (Query定義)
#### リゾルバ

リゾルバはデータを取得する役割。

特定のフィールドのデータを返す関数である。

非同期で処理ができ、REST API、DBなどからデータを取得したり更新したりできる。

#### index.jsの実装

```javascript
const { ApolloServer, gql } = require('apollo-server');

// スキーマ定義
const typeDefs = gql`
    type Query {
        totalPhotos: Int!
    }
`;

// リゾルバ関数定義
const resolvers = {
    Query: {
        totalPhotos: () => 42
    },
};

// サーバーのインスタンス作成
const server = new ApolloServer({ typeDefs, resolvers });

// The `listen` method launches a web server.
server.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`);
});
```
#### apollo server 起動
```
npm start

[nodemon] restarting due to changes...
[nodemon] starting `node index.js`
[nodemon] restarting due to changes...
[nodemon] starting `node index.js`
🚀  Server ready at http://localhost:4000/
```

### バージョン2（Mutation型）

#### index.js
```javascript
const typeDefs = gql`
    type Query {
        totalPhotos: Int!
    }

    type Mutation {
        postPhoto(name: String! description: String): Boolean!
    }
`;

var photos = []

const resolvers = {
    Query: {
        totalPhotos: () => photos.length
    },

    Mutation: {
        postPhoto(parent, args) {
            photos.push(args)
            return true
        }
    }
};
```

#### ミューテーション実行

```
mutation newPhoto {
  postPhoto(name: "sample photo")
}

// クエリ変数
mutation newPhoto ($name: String!, $description: String) {
  postPhoto(name: $name, description: $description)
}


// レスポンス
{
  "data": {
    "postPhoto": true
  }
}
```

### バージョン3（型リゾルバ）

オブジェクトを返却するリゾルバ = 型リゾルバ

#### index.js

```javascript
const typeDefs = gql`
    type Photo {
        id: ID!
        url: String!
        name: String!
        desription: String
    }

    type Query {
        totalPhotos: Int!
        allPhotos: [Photo!]!
    }

    type Mutation {
        postPhoto(name: String! description: String): Photo!
    }
`;

// 1. ユニークIDをインクリメントするための変数を定義
var _id = 0
var photos = []

const resolvers = {
    Query: {
        totalPhotos: () => photos.length,
        allPhotos: () => photos
    },

    Mutation: {
        postPhoto(parent, args) {

            // 2. 新しい写真を作成し、idを生成する
            var newPhoto = {
                id: _id++,
                ...args
            }
            photos.push(args)

            // 3. 新しい写真を返す
            return newPhoto
        }
    }
};
```

#### クエリ実行

```
// 写真投稿
// allPhotos前に何件か投稿する
mutation newPhoto ($name: String!, $description: String) {
  postPhoto(name: $name, description: $description) {
    id
    name
    desription
  }
}

// レスポンス
{
  "data": {
    "postPhoto": {
      "id": "7",
      "name": "sample",
      "desription": null
    }
  }
}

query listPhotos {
  allPhotos {
    id
    name
    desription
  }
}

// レスポンス
{
  "data": {
    "allPhotos": [
      {
        "id": "0",
        "name": "sample",
        "desription": null
      },
      {
        "id": "1",
        "name": "sample",
        "desription": null
      },
    ]
  }
}

// urlフィールド追加
query listPhotos {
  allPhotos {
    id
    name
    desription
    url
  }
}

// レスポンス
{
  "errors": [
    {
      "message": "Cannot return null for non-nullable field Photo.url.",
```

定義されていないフィールドがクエリにあると上記のエラーになる

Photoオブジェクトを追加しフィールド定義する

```javascript
const resolvers = {
    Query: {...},
    Mutation: {...},
    Photo: {
        url: parent => `http://yoursite.com/img/${parent.id}.jpg`
    }
};
```

```
// 先程エラーになったクエリ
query listPhotos {
  allPhotos {
    id
    name
    desription
    url
  }
}

// レスポンス
{
  "data": {
    "allPhotos": [
      {
        "id": "0",
        "name": "sample",
        "desription": null,
        "url": "http://yoursite.com/img/0.jpg"
      },
      {
        "id": "1",
        "name": "sample",
        "desription": null,
        "url": "http://yoursite.com/img/1.jpg"
      },
    ]
  }
}
```

### バージョン4（InputとEnum）

Input型を使うと再利用性が高まり

Enum(列挙)型を使うとバリデーションがかけられるようになる。

```javascript
const typeDefs = gql`
    // カテゴリの選択肢を定義
    enum PhotoCategory {
        SELFIE
        PORTRAIT
        ACTION
        LANDSCAPE
        GRAPHIC
    }

    type Photo {
        ...
        category: PhotoCategory!
    }

    // 入力パラメータを定義
    input PostPhotoInput {
        name: String!
        // デフォルト値
        category: PhotoCategory=PORTRAIT
        description: String
    }

    type Mutation {
        // 引数に定義したinputを使う
        postPhoto(input: PostPhotoInput!): Photo!
    }
`;
```

```
# クエリ
mutation newPhoto($input: PostPhotoInput!) {
  postPhoto(input: $input) {
    id
    name
    url
    description
    category
  }
}

# 変数
{
  "input": {
    "name": "sample photo A",
    "description": "A Sample"
  }
}

# レスポンス
{
  "data": {
    "postPhoto": {
      "id": "0",
      "name": "sample photo A",
      "url": "http://yoursite.com/img/0.jpg",
      "description": null,
      "category": "PORTRAIT"
    }
  }
}
```

### バージョン5（Eedgeと接続）

#### 1対多の接続

```javascript
const typeDefs = gql`
    // 略
    type Photo {
        id: ID!
        url: String!
        name: String!
        description: String
        category: PhotoCategory!
        postedBy: User! // 写真に対して1ユーザーが紐づく
    }

    type User {
        githubLogin: ID!
        name: String
        avatar: String
        postedPhotos: [Photo!]! // ユーザーは複数の写真を投稿できる
    }
`;

const resolvers = {
    // 略
    Photo: {
        url: parent => `http://yoursite.com/img/${parent.id}.jpg`,
        postedBy: parent => {
            // 写真に紐づく単一のユーザを返却
            return users.find(u => u.githubLogin === parent.githubUser)
        }
    },
    User: {
        postedPhotos: parent => {
            // ユーザに紐づく写真を配列で返却
            return photos.filter(p => p.githubUser === parent.githubLogin)
        }
    }
};
```

```
# クエリ
query photos {
  allPhotos {
    name
    url
    postedBy {
      name
    }
  }
}

# レスポンス
{
  "data": {
    "allPhotos": [
      {
        "name": "Dropping the Htert Chute",
        "url": "http://yoursite.com/img/1.jpg",
        "postedBy": {
          "name": "Glen Plake"
        }
      },
      {
        "name": "B",
        "url": "http://yoursite.com/img/2.jpg",
        "postedBy": {
          "name": "Scot Schmidt"
        }
      },
      {
        "name": "C",
        "url": "http://yoursite.com/img/3.jpg",
        "postedBy": {
          "name": "Scot Schmidt"
        }
      }
    ]
  }
}
```

#### 多対多の接続
写真へのタグ付機能で試してみます
- ユーザは複数の写真にタグが付ける
- 写真には複数のユーザにタグが付けられる

```javascript
const typeDefs = gql`
    type Photo {
        .....
        taggedUsers: [User!]!
    }

    type User {
        .....
        inPhotos: [Photo!]!
    }
};

const resolvers = {
    Photo: {
        .......
        taggedUsers: parent => tags
            // 対象の写真が関係するタグの配列を返す
            .filter(tag => tag.photoID === parent.id)
            // タグの配列をユーザーIDの配列に変換する
            .map(tag => tag.userID)
            // ユーザーIDの配列をユーザーオブジェクトに変換する
            .map(userID => users.find(u => u.githubLogin === userID))
    },
    User: {
        .......
        inPhotos: parent => tags
            // 対象のユーザが関係しているタグの配列を返す
            .filter(tag => tag.userID === parent.id)
            // タグの配列をPhoto IDの配列に変換する
            .map(tag => tag.photoID)
            // Photo IDの配列をPhotoオブジェクトに変換する
            .map(photoID => photos.find(p => p.id === photoID))
    }
};
```

```
// クエリ
query listPhotos {
  allPhotos {
    url
    taggedUsers {
      name
    }
  }
}

// レスポンス
{
  "data": {
    "allPhotos": [
      {
        "url": "http://yoursite.com/img/1.jpg",
        "taggedUsers": [
          {
            "name": "Glen Plake"
          }
        ]
      },
      {
        "url": "http://yoursite.com/img/2.jpg",
        "taggedUsers": [
          {
            "name": "Scot Schmidt"
          },
          {
            "name": "Mike Hattrup"
          },
          {
            "name": "Glen Plake"
          }
        ]
      },
      {
        "url": "http://yoursite.com/img/3.jpg",
        "taggedUsers": []
      }
    ]
  }
}
```

### バージョン6（カスタムスカラー型）
`Int, Floart, String,Boolean, ID` で要件が満たせない場合に定義する。

今回はDateTime型を作成する

リゾルバに以下3つの関数を定義する

関数の処理内容は仕様による

(1) クエリの引数で受け取った値をDateオブジェクトに変換
`parseValue: value => new Date(value)`

(2) 問い合わせに対する返り値をISO日時フォーマットで返却する
`serialize: value => new Date(value).toISOString()`

(3) クエリドキュメントに直接追加された場合にクエリからの抽象構文木でパースされた値を取得する処理
```
// クエリドキュメントに直接日付を追加されたクエリ
query {
  allPhotos(after: `4/18/2018`) {
    name
    url
  }
}
```

以下のようにastオブジェクトから値を取得する必要がある
`parseLiteral: ast => ast.value`

## apollo-server-express のセットアップ

Apollo Server Expressでは下記が可能になる
- Apollo Severの最新機能の利用
- 詳細設定
  - カスタムホームルート
  - プレイグラウウンドルート

これにより画像の保存ができるようになる！

```bash
# apollo-serverを削除
npm remove apollo-server
# apollo-server-expressをインストール
npm install apollo-server-express express
# playgroundをインストール
npm install graphql-playground-middleware-express
```


## MongoDB のインストール

https://docs.mongodb.com/manual/tutorial/install-mongodb-on-os-x/

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
brew services list
mongosh
npm install mongodb dotenv
```

## meクエリの実装

https://github.com/naotospace/naotospace.github.io/pull/8/commits/fdd9652281dea2837644f7bc6b7237a97e3a3690
```javascript
// 実装
const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
        // Headerから認証トークン取得
        const githubToken = req.headers.authorization
        // トークンから現在のユーザー情報取得
        const currentUser = await db.collection('users').findOne({ githubToken })
        return { db, currentUser }
    }
});

// type定義
Query: {
    ...
    me: (parent, args, { currentUser }) => currentUser,


// リゾルバ
Query: {
  me: (parent, args, { currentUser }) => currentUser,
```

```
query currentUser {
  me {
    name
  }
}
```

## postPhotoミューテーションの実装
```
// クエリ
mutation post($input: PostPhotoInput!) {
  postPhoto(input: $input) {
    id
    url
    postedBy {
      name
      avatar
    }
  }
}

// Variables
{
  "input": {
    "name": "image 1"
  }
}

// レスポンス
{
  "data": {
    "postPhoto": {
      "id": "61795dd4a78a604492eef66c",
      "url": "/img/photos/61795dd4a78a604492eef66c.jpg",
      "postedBy": {
        "name": "Naoto KISHINO",
        "avatar": "https://avatars.githubusercontent.com/u/2687752?v=4"
      }
    }
  }
}
```

## フェイクユーザーミューテーション
スキップ

# 6章 クライアントの実装

graphqlサーバーが起動していると以下のようなcurlコマンドで問い合わせできる

```bash
curl -X POST \
-H "Content-Type:application/json" \
--data '{ "query": "{totalUsers, totalPhotos}" }' \
http://localhost:4000/graphql

{"data":{"totalUsers":1,"totalPhotos":1}}
```
