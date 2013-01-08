(function() {

Facet.Marks.globe_2d = function(opts)
{
    opts = _.defaults(opts || {}, {
        zoom: 3,
        resolution_bias: -1,
        patch_size: 10,
        cache_size: 3, // 3: 64 images; 4: 256 images.
        tile_pattern: function(zoom, x, y) {
            return "http://tile.openstreetmap.org/"+zoom+"/"+x+"/"+y+".png";
        },
        debug: false, // if true, add outline and x-y-zoom marker to every tile
        no_network: false, // if true, tile is always blank white and does no HTTP requests.
        post_process: function(c) { return c; }
    });
    if (opts.interactor) {
        opts.center = opts.interactor.center;
        opts.zoom   = opts.interactor.zoom;
        opts.camera = opts.interactor.camera;
    }
    if (opts.no_network) {
        opts.debug = true; // no_network implies debug;
    }

    var patch = Facet.model({
        type: "triangles",
        uv: [[0,0,1,0,1,1,0,0,1,1,0,1], 2],
        vertex: function(min, max) {
            return this.uv.mul(max.sub(min)).add(min);
        }
    });
    var cache_size = 1 << (2 * opts.cache_size);
    var tile_size = 256;
    var tiles_per_line  = 1 << (~~Math.round(Math.log(Math.sqrt(cache_size))/Math.log(2)));
    var super_tile_size = tile_size * tiles_per_line;

    var ctx = Facet._globals.ctx;
    var texture = Facet.texture({
        width: super_tile_size,
        height: super_tile_size
    });

    function new_tile(i) {
        var x = i % tiles_per_line;
        var y = ~~(i / tiles_per_line);
        return {
            texture: texture,
            offset_x: x,
            offset_y: y,
            // 0: inactive,
            // 1: mid-request,
            // 2: ready to draw.
            active: 0,
            x: -1,
            y: -1,
            zoom: -1,
            last_touched: 0
        };
    };

    var tiles = [];
    for (var i=0; i<cache_size; ++i) {
        tiles.push(new_tile(i));
    };

    var min_x = Shade.parameter("float");
    var max_x = Shade.parameter("float");
    var min_y = Shade.parameter("float");
    var max_y = Shade.parameter("float");
    var offset_x = Shade.parameter("float");
    var offset_y = Shade.parameter("float");
    var texture_scale = 1.0 / tiles_per_line;
    var sampler = Shade.parameter("sampler2D");

    var v = patch.vertex(Shade.vec(min_x, min_y), Shade.vec(max_x, max_y));

    var xformed_patch = patch.uv 
    // These two lines work around the texture seams on the texture atlas
        .mul((tile_size-1.0)/tile_size)
        .add(0.5/tile_size)
    //
        .add(Shade.vec(offset_x, offset_y))
        .mul(texture_scale)
    ;

    var tile_batch = Facet.bake(patch, {
        gl_Position: opts.camera(v),
        gl_FragColor: opts.post_process(Shade.texture2D(sampler, xformed_patch)),
        mode: Facet.DrawingMode.pass
    });

    if (facet_typeOf(opts.zoom) === "number") {
        opts.zoom = Shade.parameter("float", opts.zoom);
    } else if (Facet.is_shade_expression(opts.zoom) !== "parameter") {
        throw "zoom must be either a number or a parameter";
    }

    var result = {
        tiles: tiles,
        queue: [],
        current_osm_zoom: opts.zoom.get(),
        lat_lon_position: function(lat, lon) {
            return Shade.Scale.Geo.latlong_to_mercator(lat, lon);
        },
        resolution_bias: opts.resolution_bias,
        new_center: function(center_x, center_y, center_zoom) {
            var w = ctx.viewportWidth;
            var zoom_divider = 63.6396;
            var base_zoom = Math.log(w / zoom_divider) / Math.log(2);

            var zoom = this.resolution_bias + base_zoom + (Math.log(center_zoom) / Math.log(2));
            zoom = ~~zoom;
            this.current_osm_zoom = zoom;
            var y = (center_y / (Math.PI * 2) + 0.5) * (1 << zoom);
            var x = (center_x / (Math.PI * 2) + 0.5) * (1 << zoom);
            // var y = (center_lat + 90) / 180 * (1 << zoom);
            // var x = center_lon / 360 * (1 << zoom);
            y = (1 << zoom) - y - 1;
            // x = (x + (1 << (zoom - 1))) & ((1 << zoom) - 1);

            for (var i=-2; i<=2; ++i) {
                for (var j=-2; j<=2; ++j) {
                    var rx = ~~x + i;
                    var ry = ~~y + j;
                    if (ry < 0 || ry >= (1 << zoom))
                        continue;
                    if (rx < 0)
                        continue;
                    if (rx >= (1 << zoom))
                        continue;
                    this.request(rx, ry, ~~zoom);
                }
            }
        },
        get_available_id: function(x, y, zoom) {
            // easy cases first: return available tile or a cache hit
            var now = Date.now();
            for (var i=0; i<cache_size; ++i) {
                if (this.tiles[i].x == x &&
                    this.tiles[i].y == y &&
                    this.tiles[i].zoom == zoom &&
                    this.tiles[i].active != 0) {
                    this.tiles[i].last_touched = now;
                    return i;
                }
            }
            for (i=0; i<cache_size; ++i) {
                if (!this.tiles[i].active) {
                    this.tiles[i].last_touched = now;
                    return i;
                }
            }
            // now we need to bump someone out. who?
            var worst_index = -1;
            var worst_time = 1e30;
            for (i=0; i<cache_size; ++i) {
                if (this.tiles[i].active == 1)
                    // don't use this one, it's getting bumped out
                    continue;
                var score = this.tiles[i].last_touched;
                if (score < worst_time) {
                    worst_time = score;
                    worst_index = i;
                }
            }
            return worst_index;
        },
        init: function() {
            for (var z=0; z<3; ++z)
                for (var i=0; i<(1 << z); ++i)
                    for (var j=0; j<(1 << z); ++j)
                        this.request(i, j, z);
        },
        sanity_check: function() {
            var d = {};
            for (var i=0; i<cache_size; ++i) {
                $("#x" + i).text(this.tiles[i].x);
                $("#y" + i).text(this.tiles[i].y);
                $("#z" + i).text(this.tiles[i].zoom);
                if (this.tiles[i].active !== 2)
                    continue;
                var k = this.tiles[i].x + "-" +
                    this.tiles[i].y + "-" +
                    this.tiles[i].zoom;
                if (d[k] !== undefined) {
                    console.log("BAD STATE!", 
                                this.tiles[i].x, this.tiles[i].y, this.tiles[i].zoom, 
                                this.tiles[i].active,
                                k);                    
                    throw "die";
                }
                d[k] = true;
            }
        },
        request: function(x, y, zoom) {
            var that = this;
            var id = this.get_available_id(x, y, zoom);
            if (id === -1) {
                console.log("Could not fulfill request " + x + " " + y + " " + zoom);
                return;
            }
            if (this.tiles[id].x == x && 
                this.tiles[id].y == y && 
                this.tiles[id].zoom == zoom) {
                return;
            }

            that.tiles[id].x = x;
            that.tiles[id].y = y;
            that.tiles[id].zoom = zoom;
            this.tiles[id].active = 1;
            var f = function(x, y, zoom, id) {
                return function() {
                    that.tiles[id].active = 2;
                    that.tiles[id].last_touched = Date.now();
                    // uncomment this during debugging
                    // that.sanity_check();
                    Facet.Scene.invalidate();
                };
            };
            var xform = opts.debug ? function(image) {
                var c = document.createElement("canvas");
                c.setAttribute("width", image.width);
                c.setAttribute("height", image.height);
                var ctx = c.getContext('2d');
                ctx.drawImage(image, 0, 0);
                ctx.font = "12pt Helvetica Neue";
                ctx.fillStyle = "black";
                ctx.fillText(zoom + " " + x + " " + y + " ", 10, 250);
                ctx.lineWidth = 3;
                ctx.strokeStyle = "black";
                ctx.strokeRect(0, 0, 256, 256);
                return c;
            } : function(image) { return image; };
            var obj = {
                transform_image: xform,
                crossOrigin: "anonymous",
                x_offset: tiles[id].offset_x * tile_size,
                y_offset: tiles[id].offset_y * tile_size,
                onload: f(x, y, zoom, id)
            };
            if (opts.no_network) {
                if (!Facet._globals.blank_globe_2d_image) {
                    var c = document.createElement("canvas");
                    c.setAttribute("width", 256);
                    c.setAttribute("height", 256);
                    var ctx = c.getContext('2d');
                    ctx.fillStyle = "white";
                    ctx.fillRect(0, 0, 256, 256);
                    Facet._globals.blank_globe_2d_image = c;
                }
                obj.canvas = Facet._globals.blank_globe_2d_image;
            } else {
                obj.src = opts.tile_pattern(zoom, x, y);
            }
            tiles[id].texture.load(obj);
        },
        draw: function() {
            this.new_center(opts.center.get()[0],
                            opts.center.get()[1],
                            opts.zoom.get());
            var lst = _.range(cache_size);
            var that = this;
            lst.sort(function(id1, id2) { 
                var g1 = Math.abs(tiles[id1].zoom - that.current_osm_zoom);
                var g2 = Math.abs(tiles[id2].zoom - that.current_osm_zoom);
                return g2 - g1;
            });

            sampler.set(texture);
            for (var i=0; i<cache_size; ++i) {
                var t = tiles[lst[i]];
                if (t.active !== 2)
                    continue;
                min_x.set((t.x / (1 << t.zoom))           * Math.PI*2 - Math.PI);
                min_y.set((1 - (t.y + 1) / (1 << t.zoom)) * Math.PI*2 - Math.PI);
                max_x.set(((t.x + 1) / (1 << t.zoom))     * Math.PI*2 - Math.PI);
                max_y.set((1 - t.y / (1 << t.zoom))       * Math.PI*2 - Math.PI);
                offset_x.set(t.offset_x);
                offset_y.set(t.offset_y);
                tile_batch.draw();
            }
        }
    };
    result.init();

    return result;
};

})();