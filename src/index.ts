import * as functions from "firebase-functions";
import express from "express";
import axios from "axios";
import PutioAPI from "@putdotio/api-client";
const app = express();
// const axios = Axios;

let allowCrossDomain = function (req: any, res: any, next: any) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
};
app.use(allowCrossDomain);

/* 
  using TMDB_ID
    TV:     /stream?client_id=1234&token=XXXYYYZZZXXXYYYZZZXX&type=tv&tmdb_id=60735&s=01&e=02
    Movies: /stream?client_id=1234&token=XXXYYYZZZXXXYYYZZZXX&type=movies&tmdb_id=299536&quality=1080p
*/
app.get("/stream", (req, res) => {
  const tmdb_id: any = req.query.tmdb_id; // 1399
  const e: any = req.query.e; // 05
  const s: any = req.query.s; // 01
  const type: any = req.query.type; // movies | tv
  const quality: any = req.query.quality; // 720p
  const client_id: any = req.query.client_id; // 1234
  const token: any = req.query.token; // XXXYYYZZZXXXYYYZZZXX
  const API = new PutioAPI({ clientID: client_id });
  // console.log({tmdb_id, e, s, type, quality, client_id, token})
  let tvDetailsUrl = `https://api.themoviedb.org/3/tv/${tmdb_id}?api_key=${process.env.REACT_APP_TMDB_API_KEY}&language=en`;
  let movieDetailsUrl = `https://api.themoviedb.org/3/movie/${tmdb_id}?api_key=${process.env.REACT_APP_TMDB_API_KEY}&language=en`;
  API.setToken(token);
  if (type === "tv") {
    console.log("TV");
    axios(tvDetailsUrl)
      .then((r) => {
        let show = r.data;
        let name = show.name;
        API.Files.Search(name, {
          perPage: 10,
          fileType: "VIDEO",
        }).then((r: any) => {
        //   var results = {};
          let files = r.data.files;
          let seasons = files.filter((file: any) => file.name.includes(s));
          let episodes = seasons.filter((file: any) => file.name.includes(e));
          let file_type = episodes.filter(
            (file: any) => file.file_type === "VIDEO"
          );
          let file_id = file_type[0].id;
          // console.log(files);
          if (file_id) {
            console.log("id available");
            API.Files.DownloadLinks({ ids: [file_id] })
              .then(({ status, body, data }: any) => {
                // var stream_url = "";
                if (status === 200) {
                  var stream_url = body.mp4_links[0].replace(
                    "download",
                    "stream"
                  );
                  res.json({ stream_url, status: "got it from putio" });
                } else if (status === 400) {
                  res.json(data);
                }
              })
              .catch((err: any) => res.json(err));
          } else if (!file_id) {
            let url = `http://185.186.246.43:5000/xtorrent?type=TV&title=${name}&s=${s}&e=${e}`;
            console.log(url);
            axios(url)
              .then((r) => {
                console.log(r.data);
                const url = String(r.data.data.main_result.magnet); //.split("&dn=");
                setTimeout(() => {
                  API.Transfers.Add({ url: url })
                    .then(({ status, body }: any) => {
                      if (status === 200) {
                        const id = body.transfer.id;
                        setTimeout(() => {
                          API.Transfers.Get(id)
                            .then(({ status, body }: any) => {
                              if (status === 200) {
                                const id = body.transfer.file_id;
                                API.Files.DownloadLinks({ ids: [id] })
                                  .then(
                                    ({
                                      status,
                                      statusText,
                                      body,
                                      data,
                                    }: any) => {
                                      var stream_url = "";
                                      if (status === 200) {
                                        stream_url = body.mp4_links[0].replace(
                                          "download",
                                          "stream"
                                        );
                                      } else if (status === 400) res.json(data);
                                      res.json({
                                        stream_url,
                                        status: "added to putio",
                                      });
                                    }
                                  )
                                  .catch((err: any) => res.json(err));
                              }
                            })
                            .catch((err: any) => res.json(err));
                        }, 400);
                      }
                    })
                    .catch((err: any) => res.json(err));
                }, 400);
              })
              .catch((e) => {
                res.json(e);
              });
          }
        });
      })
      .catch((e) => {
        res.json(e.response.data);
      });
  } else if (type === "movies") {
    axios(movieDetailsUrl).then((r) => {
      let movie = r.data;
      let name = movie.title;
      let imdb_id = movie.imdb_id;

      API.Files.Search(name, {
        perPage: 10,
        fileType: "VIDEO",
      })
        .then((r: any) => {
          var files = r.body.files;

          var videos = files.filter((file: any) => file.file_type === "VIDEO");

          var movie = videos.find((file: any) => file.name.includes(quality));

          var file_id = movie?.id;

          if (file_id) {
            console.log("File Found");
            API.Files.DownloadLinks({ ids: [file_id] })
              .then(({ status, body, data }: any) => {
                if (status === 200) {
                  var stream_url = body.mp4_links[0].replace(
                    "download",
                    "stream"
                  );
                  res.json({ stream_url, status: "got it from putio" });
                }
              })
              .catch((err: any) => res.json(err));
          } else {
            console.log("No File Found");
            console.log("Torrent Search");
            axios(
              `http://185.186.246.43:5000/imdb-torrent-search?id=${imdb_id}`
            ).then((r) => {
              if (r.data.data.movie_count === 0) {
                console.log("0 Movies");
              } else if (r.data.data.movie_count >= 1) {
                let torrents = r.data.data.movies[0].torrents;
                let torrent = torrents.find(
                  (torrent: any) => torrent.quality === quality
                );
                let url = torrent.url;
                setTimeout(() => {
                  API.Transfers.Add({ url: url })
                    .then(({ status, body }: any) => {
                      if (status === 200) {
                        const id = body.transfer.id;
                        setTimeout(() => {
                          API.Transfers.Get(id)
                            .then(({ status, body }: any) => {
                              if (status === 200) {
                                const id = body.transfer.file_id;
                                setTimeout(() => {
                                  API.Files.DownloadLinks({ ids: [id] })
                                    .then(
                                      ({
                                        status,
                                        statusText,
                                        body,
                                        data,
                                      }: any) => {
                                        if (status === 200) {
                                          var stream_url = body.mp4_links[0].replace(
                                            "download",
                                            "stream"
                                          );
                                          res.json({
                                            stream_url,
                                            status: "added it to putio",
                                          });
                                        }
                                      }
                                    )
                                    .catch((err: any) => res.json(err));
                                }, 400);
                              }
                            })
                            .catch((err: any) => res.json(err));
                        }, 400);
                      }
                    })
                    .catch((err: any) => res.json(err));
                }, 400);
              }
            });
          }
        })
        .catch((e: any) => res.json(e));
    });
  }
});

/* 
Movies: /check-file?type=movies&client_id=1234&token=XXXYYYZZZYYXXZZXXYYZ&query=the avengers&quality=1080p
TV: /check-file?type=tv&client_id=1234&token=XXXYYYZZZYYXXZZXXYYZ&query=the game of thrones&s=01&e=05
*/
app.get("/search-file", (req: any, res: any) => {
  const hash = req.query.hash; //
  const imdb_id = req.query.imdb_id; // tt0848228
  const query = req.query.query; // thrones
  const e = req.query.e; // 05
  const s = req.query.s; // 01
  const type = req.query.type; // movies | tv
  const quality = req.query.quality; // 720p
  // const fileType = req.query.file_type; // "FOLDER" | "FILE" | "AUDIO" | "VIDEO" | "IMAGE" | "ARCHIVE" | "PDF" | "TEXT" | "SWF"
  const client_id = req.query.client_id; // 1234
  const token = req.query.token; // XXXYYYZZZXXXYYYZZZXXXYYYZZZ
  const API = new PutioAPI({ clientID: client_id });
  API.setToken(token);
  res.set("Accept", "application/json");
  API.Files.Search(query ? query : imdb_id ? imdb_id : hash ? hash : "", {
      perPage: 10,
    fileType: "VIDEO",
  })
    .then((r: any) => r.data)
    .then((r: any) => {
      var results = {};
      r.files.forEach((file: any, i: any) => {
        setTimeout(() => {
          if (type === "tv") {
            // if (file.name.includes(quality)) {
            if (file.file_type === "VIDEO") {
              if (file.name.includes(s)) {
                if (file.name.includes(e)) {
                  results = {
                    index: i,
                    type: type,
                    statusCode: 200,
                    statusMsg: "OK",
                    file: file,
                    serverTime: new Date().toUTCString(),
                  };
                }
              }
            }
            // }
          } else if (type === "movies") {
            if (file.file_type === "VIDEO") {
              let name = file.name;
              if (name.includes(quality)) {
                results = {
                  index: i,
                  type: type,
                  statusCode: 200,
                  statusMsg: "OK",
                  file: file,
                  serverTime: new Date().toUTCString(),
                };
              }
            }
          }
        }, 100);
      });
      setTimeout(() => {
        res.json(results);
      }, 300);
    })
    .catch((e: any) => {
      console.log(e);
      res.status(404).json(e);
    });
});

/* 
    /get-files?client_id=1234&token=XYZ
*/
app.get("/get-files", (req, res) => {
  const id:any = req.query.id;
  const token:any = req.query.token;
  const client_id:any = req.query.client_id;
  const API = new PutioAPI({ clientID: client_id });
  API.setToken(token);
  API.Files.Query(id ? id : undefined)
    .then(({ status, statusText, body }: any) => {
      if (status === 200) res.json(body);
      else if (status === 400) res.json(body);
    })
    .catch((err: any) => res.json(err));
});

/* 
    /get-transfers?client_id=1234&token=XYZ
*/
app.get("/get-transfers", (req, res) => {
  const token:any = req.query.token;
  const client_id:any = req.query.client_id;
  const API = new PutioAPI({ clientID: client_id });
  API.setToken(token);
  API.Transfers.Query()
    .then(({ status, statusText, body }: any) => {
      if (status === 200) res.json(body);
      else if (status === 400) res.json(body);
    })
    .catch((err: any) => res.json(err));
});

/* 
  Movies: http://185.186.246.43:3000/?type=movies&client_id=1234&token=XXYYZZXXYYZZXXYYZZXX&imdb_id=tt0848228&quality=1080p
  Shows: http://185.186.246.43:3000/?type=tv&client_id=1234&token=XXYYZZXXYYZZXXYYZZXX&s=04&e=01&title=game+of+thrones
*/

app.get("/media_stream", (req, res) => {
  // AUTHENTICATION
  const client_id:any = req.query.client_id;
  const token:any = req.query.token;
  // MEDIA TYPE: type=tv || type=movies
  const type = req.query.type;
  // MOVIES
  const id = req.query.imdb_id;
  const quality = req.query.quality;
  // TV
  const title = req.query.title;
  const e = req.query.e;
  const s = req.query.s;
  // PUTIO API CLIENT
  const API = new PutioAPI({ clientID: client_id });
  API.setToken(token);
  // LOGIC
  if (type === "tv") {
    console.log("TV");
    axios(
      `http://185.186.246.43:5000/xtorrent?type=TV&title=${title}&s=${s}&e=${e}`
    )
      .then((r) => {
        const url = String(r.data.data.main_result.magnet); //.split("&dn=");
        setTimeout(() => {
          API.Transfers.Add({ url: url })
            .then(({ status, body }: any) => {
              if (status === 200) {
                const id = body.transfer.id;
                setTimeout(() => {
                  API.Transfers.Get(id)
                    .then(({ status, body }: any) => {
                      if (status === 200) {
                        const id = body.transfer.file_id;
                        API.Files.DownloadLinks({ ids: [id] })
                          .then(({ status, statusText, body, data }: any) => {
                            if (status === 200) res.json(body);
                            else if (status === 400) res.json(data);
                          })
                          .catch((err: any) => res.json(err));
                      }
                    })
                    .catch((err: any) => res.json(err));
                }, 400);
              }
            })
            .catch((err: any) => res.json(err));
        }, 400);
      })
      .catch((e) => {
        res.json(e);
      });
  } else if (type === "movies") {
    console.log("MOVIES");
    axios("http://185.186.246.43:5000/imdb-torrent-search?id=" + id)
      .then((r) => {
        const torrent = r.data.data;
        const movie = torrent.movies[0];
        movie.torrents.forEach((torrent: any) => {
          if (torrent.quality === quality) {
            const url = torrent.url;
            setTimeout(() => {
              API.Transfers.Add({ url: url })
                .then(({ status, body }: any) => {
                  if (status === 200) {
                    const id = body.transfer.id;
                    setTimeout(() => {
                      API.Transfers.Get(id)
                        .then(({ status, body }: any) => {
                          if (status === 200) {
                            const id = body.transfer.file_id;
                            API.Files.DownloadLinks({ ids: [id] })
                              .then(
                                ({ status, statusText, body, data }: any) => {
                                  if (status === 200) res.json(body);
                                  else if (status === 400) res.json(data);
                                }
                              )
                              .catch((err: any) => res.json(err));
                          }
                        })
                        .catch((err: any) => res.json(err));
                    }, 500);
                  }
                })
                .catch((err: any) => res.json(err));
            }, 500);
          }
        });
      })
      .catch((e) => res.json(e));
  } else if (type === "anime") {
  }
});

// First Step
/* 
    /login?client_id=1234&client_secret=XYZ&token=XYZ&username=user@gmail.com&password=pass123
*/
app.get("/login", (req, res) => {
  let username:any = req.query.username;
  let client_id:any = req.query.client_id;
  let client_secret:any = req.query.client_secret;
  let token:any = req.query.token;
  let password:any = req.query.password;
  const API = new PutioAPI({ clientID: client_id });
  API.setToken(token);

  API.Auth.Login({
    username: username,
    password: password,
    app: { client_id: client_id, client_secret: client_secret },
  })
    .then(({ status, statusText, body }: any) => {
      if (status === 200) res.json(body);
      else if (status === 400) res.json(body);
    })
    .catch((err: any) => res.json(err));
});

// Second Step
/* 
    /add?client_id=1234&token=XYZ&url=magnet:?xt=urn:btih:2565FA368FA317C90B2A3E7925CDE8F58FF99410
*/
app.get("/add", (req, res) => {
  let token:any = req.query.token;
  let client_id:any = req.query.client_id;
  const API = new PutioAPI({ clientID: client_id });
  API.setToken(token);

  const url:any = req.query.url;
  API.Transfers.Add({ url: url })
    .then(({ status, statusText, body }: any) => {
      if (status === 200) res.json(body);
      else if (status === 400) res.json(body);
    })
    .catch((err: any) => res.json(err));
});

// Third Step
/* 
    /transfer-info?client_id=1234&token=XYZ&transfer_id=6544251
*/
app.get("/transfer-info", (req, res) => {
  let id:any = req.query.transfer_id;
  let token:any = req.query.token;
  let client_id:any = req.query.client_id;
  const API = new PutioAPI({ clientID: client_id });
  API.setToken(token);
  API.Transfers.Get(id)
    .then(({ status, statusText, body }: any) => {
      if (status === 200) res.json(body);
      else if (status === 400) res.json(body);
    })
    .catch((err: any) => res.json(err));
});

// Stream
/* 
    /m3u8?client_id=1234&token=XYZ&transfer_id=6544251
*/
app.get("/m3u8", (req, res) => {
  let id:any = req.query.id;
  let token:any = req.query.token;
  let client_id:any = req.query.client_id;
  const API = new PutioAPI({ clientID: client_id });
  API.setToken(token);
  let stream_url = API.File.GetHLSStreamURL(id);
  res.json({ stream_url });
});

// Download Link
/* 
    Multiple Files: /download?client_id=1234&token=XYZ&ids=75476343,75478993
    Single File: /download?client_id=1234&token=XYZ&ids=75476343
*/
app.get("/download", (req, res, next) => {
  let token:any = req.query.token;
  let client_id:any = req.query.client_id;
  const API = new PutioAPI({ clientID: client_id });
  API.setToken(token);

  let ids:any = req.query.ids;
  API.Files.DownloadLinks({ ids: [ids] })
    .then(({ status, statusText, body, data }: any) => {
      if (status === 200) res.json(body);
      else if (status === 400) res.json(data);
    })
    .catch((err: any) => res.json(err));
});

// Optional
/* 
    /logout?client_id=1234&token=XYZ
*/
app.get("/logout", (req, res) => {
  let token:any = req.query.token;
  let client_id:any = req.query.client_id;
  const API = new PutioAPI({ clientID: client_id });
  API.setToken(token);

  API.Auth.Logout()
    .then(({ status, statusText, body }: any) => {
      if (status === 200) res.json(body);
      else if (status === 400) res.json(body);
    })
    .catch((err: any) => res.json(err));
});

// app.listen(3000);
// console.log("http://185.186.246.43:3000");

exports.app = functions.https.onRequest(app);
