import json
import os

def compress_route_data(input_path, output_path, use_array_format=False):
    try:
        with open(input_path, 'r') as f:
            data = json.load(f)
            
        nodes = data.get('nodes', [])
        connections = data.get('connections', [])
        
        compressed_nodes = []
        compressed_connections = []
        
        # 1. Compress Nodes
        for node in nodes:
            lat = round(node['latitude'], 6)
            lon = round(node['longitude'], 6)
            
            if use_array_format:
                compressed_nodes.append([node['id'], lat, lon])
            else:
                compressed_nodes.append({"id": node['id'], "lat": lat, "lon": lon})
                
        # 2. Compress Connections
        if isinstance(connections, dict):
            # Handles Adjacency List format: {"nodeA": ["nodeB", "nodeC"], ...}
            for source, targets in connections.items():
                if isinstance(targets, list):
                    for target in targets:
                        if isinstance(target, str):
                            # Edges are just strings: "nodeA": ["nodeB"]
                            if use_array_format:
                                compressed_connections.append([source, target])
                            else:
                                compressed_connections.append({"f": source, "t": target})
                        elif isinstance(target, dict):
                            # Edges are objects in a list: "nodeA": [{"to": "nodeB", "weight": 5}]
                            t_node = target.get('to', target.get('node', target.get('id')))
                            weight = target.get('weight', target.get('distance'))
                            
                            if use_array_format:
                                compressed_connections.append([source, t_node, round(weight, 3)] if weight else [source, t_node])
                            else:
                                c_obj = {"f": source, "t": t_node, "w": round(weight, 3)} if weight else {"f": source, "t": t_node}
                                compressed_connections.append(c_obj)
                                
                elif isinstance(targets, dict):
                    # Handles target mapping format: {"nodeA": {"nodeB": 1.5, "nodeC": 2.0}}
                    for target, weight in targets.items():
                        if use_array_format:
                            compressed_connections.append([source, target, round(weight, 3)])
                        else:
                            compressed_connections.append({"f": source, "t": target, "w": round(weight, 3)})

        elif isinstance(connections, list):
            # Handles list of edge objects: [{"from": "nodeA", "to": "nodeB"}]
            for conn in connections:
                n1 = conn.get('from', conn.get('startNode', conn.get('source')))
                n2 = conn.get('to', conn.get('endNode', conn.get('target')))
                weight = conn.get('distance', conn.get('weight'))
                
                if use_array_format:
                    if weight is not None:
                        compressed_connections.append([n1, n2, round(weight, 3)])
                    else:
                        compressed_connections.append([n1, n2])
                else:
                    c_obj = {"f": n1, "t": n2}
                    if weight is not None:
                        c_obj["w"] = round(weight, 3)
                    compressed_connections.append(c_obj)
                
        # Output payload
        payload = {
            "nodes": compressed_nodes,
            "connections": compressed_connections
        }
        
        with open(output_path, 'w') as f:
            json.dump(payload, f, separators=(',', ':'))
            
        print(f"Success: Compressed {input_path} -> {output_path}")
        
    except Exception as e:
        print(f"Error parsing JSON data: {e}")

# Maximum structural compression (strips all keys, relies on array indexes)
compress_route_data('C:\\Users\\geek4\\OneDrive\\Desktop\\Programming Nonsense\\MapQP\\mapqpApp\\src\\data\\route-points.json', 'C:\\Users\\geek4\\OneDrive\\Desktop\\Programming Nonsense\\MapQP\\mapqpApp\\src\\data\\route-points-ultra.json', use_array_format=True)