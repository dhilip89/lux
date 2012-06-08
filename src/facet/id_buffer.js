Facet.id_buffer = function(vertex_array)
{
    if (facet_typeOf(vertex_array) !== 'array')
        throw "id_buffer expects array of integers";
    var typedArray = new Int32Array(vertex_array);
    var byteArray = new Uint8Array(typedArray.buffer);
    return Facet.attribute_buffer({
        vertex_array: byteArray, 
        item_size: 4, 
        item_type: 'ubyte', 
        normalized: true
    });
};
