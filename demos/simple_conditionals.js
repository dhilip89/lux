var gl;
var cube_drawable;
var mv;
var proj;
var angle = 0;
var sampler = [];
var cube_model;

//////////////////////////////////////////////////////////////////////////////

function create_cube_drawable(opts)
{
    var b = cube_model.tex_coord.fract().lessThanEqual(Shade.vec(0.5, 0.5));
    var t = b.at(0).logical_xor(b.at(1));
    var material_color = t.selection(Shade.texture2D(sampler[0], cube_model.tex_coord),
                                     Shade.texture2D(sampler[1], cube_model.tex_coord));
    var mvp = proj.mul(mv);
    return Facet.bake(cube_model, {
        position: mvp.mul(Shade.vec(cube_model.vertex, 1)),
        color: material_color
    });
}

function draw_it()
{
    var model_cube = Facet.rotation(angle * (Math.PI / 180),[1,1,1]);
    var view       = Facet.translation(0.0, 0.0, -6.0);
    gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    mv.set(mat4.product(view, model_cube));
    proj.set(Facet.perspective(45, 720/480, 0.1, 100.0));
    cube_drawable.draw();
}

$().ready(function () {
    var canvas = document.getElementById("webgl");

    gl = Facet.initGL(canvas,
                     {
                         clearDepth: 1.0,
                         clearColor: [0,0,0,1],
                         display: draw_it,
                         attributes:
                         {
                             alpha: true,
                             depth: true
                         },
                         debugging: true
                     });

    cube_model = Models.flat_cube();
    mv = Shade.uniform("mat4");
    proj = Shade.uniform("mat4");

    sampler[0] = Shade.uniform(
        "sampler2D", Facet.texture_from_image({ src: "img/glass.jpg", onload: function() { gl.display(); } }));
    sampler[1] = Shade.uniform(
        "sampler2D", Facet.texture_from_image({ src: "img/crate.jpg", onload: function() { gl.display(); } }));

    cube_drawable = create_cube_drawable();

    var start = new Date().getTime();
    var f = function() {
        window.requestAnimFrame(f, canvas);
        var elapsed = new Date().getTime() - start;
        angle = elapsed / 20;
        gl.display();
    };
    f();
});
