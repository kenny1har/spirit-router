const router = require("../lib/router")
const _destructure = require("../lib/routes")._destructure

describe("router", () => {

  describe("_lookup", () => {
    // setup some routes for testing
    const _routes = require("../lib/routes")
    const routes = _routes.verbs

    let test_routes = [
      routes.get("/", [], ()=>{}),
      routes.post("/", [], ()=>{}),
      routes.get("/bloop/test", [], ()=>{}),
      _routes.verb("cuStom", "/", [], ()=>{}),
    ]
    test_routes = test_routes.map((r) => {
      return _routes.compile.apply(undefined, r)
    })


    it("looks up route", () => {
      let r = router._lookup(test_routes[0], "GET", "/")
      expect(r[0]).toBe("/")
      expect(r instanceof Array).toBe(true)

      r = router._lookup(test_routes[2], "GET", "/bloop/test")
      expect(r[0]).toBe("/bloop/test")
      expect(r instanceof Array).toBe(true)

      // doesn't match anything
      test_routes.forEach((route) => {
        r = router._lookup(route, "get", "/bloop/test/123")
        expect(r).toBe(undefined)
      })
    })

    it("a route method '*' will match any request method", () => {
      let test = _routes.verb("*", "/", [], "Hello World")
      test = _routes.compile.apply(undefined, test)
      let r = router._lookup(test, "GET", "/")
      expect(r[0]).toBe("/")

      test = routes.any("/test", [], "Hello World")
      test = _routes.compile.apply(undefined, test)
      r = router._lookup(test, "POST", "/test")
      expect(r[0]).toBe("/test")
    })

  })

  describe("_destructure", () => {
    it("returns values in the same order as keys passed in", () => {
      let result = _destructure(["a", "c", "b"], {a: 1, b: 2, c: 3})
      expect(result).toEqual([1, 3, 2])
    })

    it("can get the value of a nested object", () => {
      const result = _destructure([["a", "nested"], "b"], {
        a: {
          c: 123,
          nested: "nest"
        },
        b: "ok",
        c: "notok"
      })

      expect(result).toEqual(["nest", "ok"])
    })

    it("is ok with falsey values and returns them", () => {
      // note: the undefined here is only one that isn't
      // returned "directly"
      const keys = [["a", "nested"], "b", "c", "d", "e"]
      const obj = {
        a: {
          nested: null
        },
        b: 0,
        c: false,
        d: undefined,
        e: ""
      }
      const r = _destructure(keys, obj)
      expect(r[0]).toBe(null)
      expect(r[1]).toBe(0)
      expect(r[2]).toBe(false)
      expect(r[3]).toBe(undefined)
      expect(r[4]).toBe("")
    })

    it("gives priority to params over the root", () => {
      const keys = ["a", "b"]
      const obj = {
        a: 1,
        params: { a: 123 },
        b: 2
      }
      const r = _destructure(keys, obj)
      expect(r).toEqual([123, 2])
    })

    it("'request' gives the request map itself", () => {
      const keys = ["request", "b"]
      const obj = {
        a: 1,
        params: { a: 123 },
        b: 2
      }
      const r = _destructure(keys, obj)
      expect(Array.isArray(r)).toBe(true)

      expect(r[0]).toBe(obj)
      expect(r[0].a).toBe(1)

      expect(r[1]).toBe(2)
    })

    it("'request' doesn't have priority over params, and is considered part of root", () => {
      const keys = ["req", "request"]
      const obj = {
        params: { req: 123, request: 123 },
        req: 2,
        request: 1
      }
      const r = _destructure(keys, obj)
      expect(r).toEqual([123, 123])
    })

    it("'request' does not support nesting / direct look up", () => {
      const keys = [["request", "params"], "params"]
      const obj = {
        params: { req: 123, request: 123 },
        req: 2,
        request: 1
      }
      const r = _destructure(keys, obj)
      // the first result is request and not request.params
      // despite ["request", "params"]
      // this is to prevent possible circular look ups
      expect(r[0]).toEqual(obj)
      expect(r[1]).toEqual(obj.params)
    })

    it("can use direct look to override params with the same name", () => {
      const keys = [["req"], "req"]
      const obj = {
        params: { req: 123, request: 123 },
        req: 2,
        request: 1
      }
      const r = _destructure(keys, obj)
      expect(r).toEqual([2, 123])
    })

    it("'req' gives the raw req object", () => {
      const keys = ["req"]
      const obj = {
        a: 1,
        params: { a: 123 },
        b: 2,
        req: () => { return "raw req" }
      }
      let r = _destructure(keys, obj)
      expect(Array.isArray(r)).toBe(true)
      expect(r[0]).toBe("raw req")
    })

    it("'req' with nesting / direct look up does nothing", () => {
      const keys = [["req", "raw"]]
      const obj = {
        a: 1,
        params: { a: 123 },
        b: 2,
        req: () => { return { raw: true } }
      }
      let r = _destructure(keys, obj)
      expect(Array.isArray(r)).toBe(true)
      expect(r[0]).toEqual(obj.req())
    })
  })

  describe("wrap", () => {
    it("accepts a single function as a middleware", (done) => {
      const middleware = (handler) => {
        return (request) => {
          return handler(request).then((resp) => {
            resp.body += "123"
            return resp
          })
        }
      }

      const fn = router.wrap(["GET", "/", [], "hello"], middleware)
      fn({url: "/", method: "GET"}, "").then((resp) => {
        expect(resp.body).toBe("hello123")
        done()
      })
    })

    it("guards against invalid type for middleware", () => {
      const route = ["GET", "/", [], "hello"]
      expect(router.wrap.bind(null, route)).toThrowError(/Expected `wrap`/)
      expect(router.wrap.bind(null, route, "")).toThrowError(/Expected `wrap`/)
      expect(router.wrap.bind(null, route, {})).toThrowError(/Expected `wrap`/)
      expect(router.wrap.bind(null, route, [])).not.toThrow()
    })

    it("wrap only works for routing functions with (request, prefix, handler_only) signature", () => {
      // best way prevent this is to use the function signatures
      // signatures argument length
      expect(() => {
        router.wrap((a, b) => {}, [])
      }).toThrowError(/route being passed to/)

      expect(() => {
        router.wrap((a) => {}, [])
      }).toThrowError(/route being passed to/)

      // exceeding 3 is not ok either
      expect(() => {
        router.wrap((a, b, c, d) => { return [()=>{}, ""] }, [()=>{}])
      }).toThrowError(/route being passed to/)

      // the function takes 3 arguments, but the return is not right
      expect(() => {
        router.wrap((a, b, c) => { return "ok" }, [()=>{}])
      }).toThrowError(/route being passed to/)

      router.wrap((a, b, c) => { return [()=>{}, ""] }, [()=>{}])
    })

    it("wrapped middleware only initialize once", (done) => {
      let init = 0
      let called = 0

      const middleware = (handler) => {
        init += 1
        return (req) => {
          called += 1
          return handler(req)
        }
      }

      // route path (compose)
      const route_path = router.wrap(["GET", "/test", [], "ok"], middleware)

      // define path (compose_args)
      const test = (req, prefix, handler_only) => {
        return [() => {}, "/test"]
      }
      const define_path = router.wrap(test, middleware)


      const test_run = (fn, req, count, callback) => {
        if (count > 3) {
          return callback()
        }
        const t = test_run.bind(undefined, fn, req, count + 1, callback)
        fn(req).then(t)
      }

      test_run(route_path, {url: "/test", method: "GET"}, 0, () => {
        expect(init).toBe(2)
        expect(called).toBe(4)
        test_run(define_path, {url: "/test"}, 0, () => {
          expect(init).toBe(2)
          expect(called).toBe(8)
          done()
        })
      })
    })

    it("wrapped middleware (with compose_args) will remove _routing when passed to handler", (done) => {
      const test = (req, prefix, handler_only) => {
        const test_handler = (req) => {
          expect(req._routing).toBe(undefined)
          expect(Object.keys(req)).toEqual(["a", "url"])
          done()
        }
        return [test_handler, "/test"]
      }
      const middleware = (handler) => { return (req) => { return handler(req) }}
      const route = router.wrap(test, middleware)
      route({ a: 1, url: "/test" })
    })
  })

  describe("define", () => {
    it("will throw if routes argument is not an array", () => {
      expect(() => {
        router.define({})
      }).toThrowError(/Expected `define` to be/)

      expect(() => {
        router.define("/test", 123)
      }).toThrowError(/Expected `define` to be/)
    })
  })

})
