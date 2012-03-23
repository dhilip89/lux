var gl;
var t;

function data_buffers()
{
    /* Inspired by Lee Byron's test data generator, from
     * 
     * http://mbostock.github.com/d3/ex/stream_layers.js
     *
     */
    function stream_layers(n, m, o) {
        if (arguments.length < 3) o = 0;
        function bump(a) {
            var x = 1 / (.1 + Math.random()),
            y = 2 * Math.random() - .5,
            z = 10 / (.1 + Math.random());
            for (var i = 0; i < m; i++) {
                var w = (i / m - y) * z;
                a[i] += x * Math.exp(-w * w);
            }
        }
        return _.range(n).map(function() {
            var a = [], i;
            for (i = 0; i < m; i++) a[i] = o + o * Math.random();
            for (i = 0; i < 5; i++) bump(a);
            return a.map(stream_index);
        });
    }

    function stream_index(d, i) {
        return {x: i, y: Math.max(0, d)};
    }

    var buffers = stream_layers(4, 64, 0.1);
    var xs = buffers.map(function(buffer) {
        return buffer.map(function(obj) { return obj.x; });
    });
    var ys = buffers.map(function(buffer) {
        return buffer.map(function(obj) { return obj.y; });
    });
    var mx = 0;
    for (var i=1; i<ys.length; ++i) {
        var yp = ys[i-1], yc = ys[i];
        for (var j=0; j<yc.length; ++j) {
            yc[j] += yp[j];
            mx = Math.max(mx, yc[j]);
        };
    }
    return [xs, ys, mx];
}

function init_webgl()
{
    var canvas = document.getElementById("canvas");
    gl = Facet.init(canvas, { 
        clearColor: [0, 0, 0, 0.2]
    });
    Facet.set_context(gl);
    var data = data_buffers();
    var mx = data[2];

    var project = Shade(function(x) { return x.mul(2).sub(1); });
    console.log(data[0].length, data[0][0].length);

    t = Shade.parameter("float", 0.0);
    var this_t = t.mul(64);

    for (var i=0; i<data[0].length; ++i) {
        var left = Facet.Data.array_1d(data[0][i]);
        var top = Facet.Data.array_1d(data[1][i]);
        Facet.Scene.add(Facet.Marks.aligned_rects({
            elements: left.length,
            bottom: _.compose(project, function(i) { return 0; }),
            top:    _.compose(project, function(i) { return Shade.Utils.linear(i, i.add(1), 0, top.at(i).div(mx))(Shade.clamp(this_t, i, i.add(1))); }),
            left:   _.compose(project, function(i) { return left.at(i).div(left.length); }),
            right:  _.compose(project, function(i) { return left.at(i).add(0.9).div(left.length); }),
            color:  Shade.Colors.shadetable.hcl.create(3, 50 + i * 5, 50 + i * 10).as_shade()
        }));
    }
}

$().ready(function() {
    init_webgl();
    var start = new Date().getTime();
    var f = function() {
        window.requestAnimFrame(f);
        var elapsed = (new Date().getTime() - start) / 1000;
        t.set(Math.min(elapsed * 2, 1));
        gl.display();
    };
    f();
});